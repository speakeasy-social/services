import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import { v4 as uuidv4 } from 'uuid';

// Note: The notifyReply handler makes external calls to Bluesky's public API for non-Speakeasy posts.
// We test the database operations and notification creation for Speakeasy posts.

const authorDid = 'did:example:author';
const parentAuthorDid = 'did:example:parent-author';
const rootAuthorDid = 'did:example:root-author';

describe('notifyReply database operations', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data - order matters due to foreign key constraints
    await prisma.reaction.deleteMany();
    await prisma.mediaPost.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.seenNotifications.deleteMany();
    await prisma.encryptedPost.deleteMany();
    await prisma.sessionKey.deleteMany();
    await prisma.session.deleteMany();
  });

  it('should find the reply post by URI', async () => {
    const sessionId = uuidv4();
    const uri = `at://${authorDid}/social.spkeasy.privatePost/reply123`;

    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    await prisma.encryptedPost.create({
      data: {
        uri,
        authorDid,
        rkey: 'reply123',
        langs: ['en'],
        encryptedContent: Buffer.from('encrypted-content'),
        sessionId,
        createdAt: new Date(),
      },
    });

    const post = await prisma.encryptedPost.findUnique({
      where: { uri },
    });

    expect(post).toBeDefined();
    expect(post?.authorDid).toBe(authorDid);
  });

  it('should return null when post is not found', async () => {
    const nonExistentUri = 'at://did:example:nobody/social.spkeasy.privatePost/fake';

    const post = await prisma.encryptedPost.findUnique({
      where: { uri: nonExistentUri },
    });

    expect(post).toBeNull();
  });

  it('should find session keys for notification recipients', async () => {
    const sessionId = uuidv4();

    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Create session keys for potential notification recipients
    await prisma.sessionKey.createMany({
      data: [
        {
          sessionId,
          recipientDid: parentAuthorDid,
          encryptedDek: Buffer.from('dek-1'),
          userKeyPairId: '00000000-0000-0000-0000-000000000001',
        },
        {
          sessionId,
          recipientDid: rootAuthorDid,
          encryptedDek: Buffer.from('dek-2'),
          userKeyPairId: '00000000-0000-0000-0000-000000000002',
        },
      ],
    });

    const authors = [parentAuthorDid, rootAuthorDid];

    const authorsThatMaySeeReply = await prisma.sessionKey.findMany({
      where: {
        recipientDid: { in: authors },
        sessionId,
      },
      select: {
        recipientDid: true,
      },
    });

    expect(authorsThatMaySeeReply).toHaveLength(2);
    expect(authorsThatMaySeeReply.map(a => a.recipientDid)).toContain(parentAuthorDid);
    expect(authorsThatMaySeeReply.map(a => a.recipientDid)).toContain(rootAuthorDid);
  });

  it('should create notifications for thread participants', async () => {
    const sessionId = uuidv4();
    const replyUri = `at://${authorDid}/social.spkeasy.privatePost/reply123`;

    // Create notifications for thread participants
    await prisma.notification.createMany({
      data: [
        {
          id: uuidv4(),
          userDid: parentAuthorDid,
          authorDid,
          reason: 'reply',
          reasonSubject: replyUri,
          updatedAt: new Date(),
        },
        {
          id: uuidv4(),
          userDid: rootAuthorDid,
          authorDid,
          reason: 'reply',
          reasonSubject: replyUri,
          updatedAt: new Date(),
        },
      ],
    });

    const notifications = await prisma.notification.findMany({
      where: {
        reason: 'reply',
        reasonSubject: replyUri,
      },
    });

    expect(notifications).toHaveLength(2);
    expect(notifications.every(n => n.authorDid === authorDid)).toBe(true);
  });

  it('should not create duplicate notifications', async () => {
    const replyUri = `at://${authorDid}/social.spkeasy.privatePost/reply123`;
    const notificationId = uuidv4();

    // Create first notification
    await prisma.notification.create({
      data: {
        id: notificationId,
        userDid: parentAuthorDid,
        authorDid,
        reason: 'reply',
        reasonSubject: replyUri,
        updatedAt: new Date(),
      },
    });

    // Try to create duplicate (same userDid, authorDid, reason, reasonSubject)
    // The handler uses createMany which skips duplicates
    try {
      await prisma.notification.create({
        data: {
          id: uuidv4(), // Different ID
          userDid: parentAuthorDid,
          authorDid,
          reason: 'reply',
          reasonSubject: replyUri,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      // Unique constraint violation expected
      expect(error).toBeDefined();
    }

    const notifications = await prisma.notification.findMany({
      where: {
        userDid: parentAuthorDid,
        reason: 'reply',
        reasonSubject: replyUri,
      },
    });

    // Should still only have one notification
    expect(notifications).toHaveLength(1);
  });

  it('should find posts with session key information', async () => {
    const sessionId = uuidv4();
    const replyAuthorDid = 'did:example:reply-author';
    const parentUri = `at://${parentAuthorDid}/social.spkeasy.privatePost/parent123`;

    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid: parentAuthorDid,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    await prisma.encryptedPost.create({
      data: {
        uri: parentUri,
        authorDid: parentAuthorDid,
        rkey: 'parent123',
        langs: ['en'],
        encryptedContent: Buffer.from('parent-content'),
        sessionId,
        createdAt: new Date(),
      },
    });

    // Create session key for the reply author to see the parent post
    await prisma.sessionKey.create({
      data: {
        sessionId,
        recipientDid: replyAuthorDid,
        encryptedDek: Buffer.from('dek'),
        userKeyPairId: '00000000-0000-0000-0000-000000000001',
      },
    });

    // Query as the handler does
    const parentPost = await prisma.encryptedPost.findUnique({
      where: { uri: parentUri },
      include: {
        session: {
          include: {
            sessionKeys: {
              where: {
                recipientDid: replyAuthorDid,
              },
              select: {
                encryptedDek: true,
                userKeyPairId: true,
              },
            },
          },
        },
      },
    });

    expect(parentPost).toBeDefined();
    expect(parentPost?.session?.sessionKeys).toHaveLength(1);
    expect(parentPost?.session?.sessionKeys[0].userKeyPairId).toBe('00000000-0000-0000-0000-000000000001');
  });
});
