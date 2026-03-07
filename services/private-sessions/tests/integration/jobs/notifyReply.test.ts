import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import { v4 as uuidv4 } from 'uuid';

vi.mock('@speakeasy-services/common', async () => {
  const actual = await vi.importActual<typeof import('@speakeasy-services/common')>('@speakeasy-services/common');
  return {
    ...actual,
    speakeasyApiRequest: vi.fn().mockResolvedValue({ trusted: [] }),
    checkIfFollowedBy: vi.fn().mockResolvedValue(false),
  };
});

import { speakeasyApiRequest, checkIfFollowedBy } from '@speakeasy-services/common';

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
    const nonExistentUri =
      'at://did:example:nobody/social.spkeasy.privatePost/fake';

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
    expect(authorsThatMaySeeReply.map((a) => a.recipientDid)).toContain(
      parentAuthorDid,
    );
    expect(authorsThatMaySeeReply.map((a) => a.recipientDid)).toContain(
      rootAuthorDid,
    );
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
    expect(notifications.every((n) => n.authorDid === authorDid)).toBe(true);
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
    expect(parentPost?.session?.sessionKeys[0].userKeyPairId).toBe(
      '00000000-0000-0000-0000-000000000001',
    );
  });
});

describe('notifyReply pending behavior', () => {
  let prisma: PrismaClient;

  // Set up a thread: parentAuthor wrote a post, replyAuthor replied
  const replyAuthorDid = 'did:example:reply-author';
  const parentPostAuthorDid = 'did:example:parent-post-author';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(speakeasyApiRequest).mockResolvedValue({ trusted: [] });
    vi.mocked(checkIfFollowedBy).mockResolvedValue(false);

    await prisma.reaction.deleteMany();
    await prisma.mediaPost.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.seenNotifications.deleteMany();
    await prisma.encryptedPost.deleteMany();
    await prisma.sessionKey.deleteMany();
    await prisma.session.deleteMany();
  });

  async function createThreadWithReply() {
    const sessionId = uuidv4();
    const parentUri = `at://${parentPostAuthorDid}/social.spkeasy.feed.privatePost/parent1`;
    const replyUri = `at://${replyAuthorDid}/social.spkeasy.feed.privatePost/reply1`;

    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid: parentPostAuthorDid,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Parent post
    await prisma.encryptedPost.create({
      data: {
        uri: parentUri,
        authorDid: parentPostAuthorDid,
        rkey: 'parent1',
        langs: ['en'],
        encryptedContent: Buffer.from('parent-content'),
        sessionId,
      },
    });

    // Reply post
    await prisma.encryptedPost.create({
      data: {
        uri: replyUri,
        authorDid: replyAuthorDid,
        rkey: 'reply1',
        langs: ['en'],
        encryptedContent: Buffer.from('reply-content'),
        sessionId,
        replyUri: parentUri,
        replyRootUri: parentUri,
      },
    });

    // Session keys: both can see each other's posts
    await prisma.sessionKey.createMany({
      data: [
        {
          sessionId,
          recipientDid: parentPostAuthorDid,
          encryptedDek: Buffer.from('dek-1'),
          userKeyPairId: '00000000-0000-0000-0000-000000000001',
        },
        {
          sessionId,
          recipientDid: replyAuthorDid,
          encryptedDek: Buffer.from('dek-2'),
          userKeyPairId: '00000000-0000-0000-0000-000000000002',
        },
      ],
    });

    return { sessionId, parentUri, replyUri };
  }

  it('should create pending notification when reply author is not trusted or followed', async () => {
    const { createNotifyReplyHandler } = await import('../../../src/handlers/notifyReply.js');
    const handler = createNotifyReplyHandler(prisma);
    const { replyUri } = await createThreadWithReply();

    // Neither trusted nor followed (defaults from beforeEach)
    await handler({
      data: { uri: replyUri, token: 'fake-token', _encrypted: undefined },
    });

    const notifications = await prisma.notification.findMany({
      where: { reason: 'reply', reasonSubject: replyUri },
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].userDid).toBe(parentPostAuthorDid);
    expect(notifications[0].pending).toBe(true);
    expect(notifications[0].notifiedAt).toEqual(new Date(0));
  });

  it('should create non-pending notification when reply author is trusted', async () => {
    const { createNotifyReplyHandler } = await import('../../../src/handlers/notifyReply.js');
    const handler = createNotifyReplyHandler(prisma);
    const { replyUri } = await createThreadWithReply();

    // Reply author IS trusted by parent post author
    vi.mocked(speakeasyApiRequest).mockResolvedValue({
      trusted: [{ recipientDid: replyAuthorDid }],
    });

    await handler({
      data: { uri: replyUri, token: 'fake-token', _encrypted: undefined },
    });

    const notifications = await prisma.notification.findMany({
      where: { reason: 'reply', reasonSubject: replyUri },
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].pending).toBe(false);
    expect(notifications[0].notifiedAt.getTime()).toBeGreaterThan(0);
  });

  it('should create non-pending notification when reply author is followed', async () => {
    const { createNotifyReplyHandler } = await import('../../../src/handlers/notifyReply.js');
    const handler = createNotifyReplyHandler(prisma);
    const { replyUri } = await createThreadWithReply();

    // Not trusted, but IS followed
    vi.mocked(speakeasyApiRequest).mockResolvedValue({ trusted: [] });
    vi.mocked(checkIfFollowedBy).mockResolvedValue(true);

    await handler({
      data: { uri: replyUri, token: 'fake-token', _encrypted: undefined },
    });

    const notifications = await prisma.notification.findMany({
      where: { reason: 'reply', reasonSubject: replyUri },
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].pending).toBe(false);
  });

  it('should not check follows if already trusted (optimization)', async () => {
    const { createNotifyReplyHandler } = await import('../../../src/handlers/notifyReply.js');
    const handler = createNotifyReplyHandler(prisma);
    const { replyUri } = await createThreadWithReply();

    // Trusted
    vi.mocked(speakeasyApiRequest).mockResolvedValue({
      trusted: [{ recipientDid: replyAuthorDid }],
    });

    await handler({
      data: { uri: replyUri, token: 'fake-token', _encrypted: undefined },
    });

    // checkIfFollowedBy should not have been called since trust check passed
    expect(checkIfFollowedBy).not.toHaveBeenCalled();
  });
});
