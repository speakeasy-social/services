import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import { v4 as uuidv4 } from 'uuid';

// Note: The addRecipientToSession handler makes external calls to trusted-users and user-keys services.
// We test the database operations separately here.

const authorDid = 'did:example:author';
const recipientDid = 'did:example:recipient';

describe('addRecipientToSession database operations', () => {
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

  it('should find sessions with author keys that need recipient added', async () => {
    const sessionId = uuidv4();

    // Create a recent session
    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      },
    });

    // Add author's session key (author always has key to their own session)
    await prisma.sessionKey.create({
      data: {
        sessionId,
        recipientDid: authorDid,
        encryptedDek: Buffer.from('test-author-dek'),
        userKeyPairId: '00000000-0000-0000-0000-000000000001',
      },
    });

    // Query sessions that have author key but not recipient key (what handler does)
    const sessionsNeedingRecipient = await prisma.session.findMany({
      where: {
        authorDid,
        sessionKeys: {
          some: { recipientDid: authorDid }, // Has author key
          none: { recipientDid }, // Does not have recipient key
        },
      },
      include: {
        sessionKeys: {
          where: { recipientDid: authorDid },
        },
      },
    });

    expect(sessionsNeedingRecipient).toHaveLength(1);
    expect(sessionsNeedingRecipient[0].sessionKeys).toHaveLength(1);
  });

  it('should filter out sessions older than 30 days', async () => {
    const oldSessionId = uuidv4();
    const recentSessionId = uuidv4();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Create an old session
    await prisma.session.create({
      data: {
        id: oldSessionId,
        authorDid,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), // 31 days ago
      },
    });

    // Create a recent session
    await prisma.session.create({
      data: {
        id: recentSessionId,
        authorDid,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(), // Now
      },
    });

    // Add author keys to both
    await prisma.sessionKey.createMany({
      data: [
        {
          sessionId: oldSessionId,
          recipientDid: authorDid,
          encryptedDek: Buffer.from('old-dek'),
          userKeyPairId: '00000000-0000-0000-0000-000000000001',
        },
        {
          sessionId: recentSessionId,
          recipientDid: authorDid,
          encryptedDek: Buffer.from('recent-dek'),
          userKeyPairId: '00000000-0000-0000-0000-000000000001',
        },
      ],
    });

    // Query with 30-day filter (what handler does)
    const recentSessions = await prisma.session.findMany({
      where: {
        authorDid,
        createdAt: { gte: thirtyDaysAgo },
        sessionKeys: {
          some: { recipientDid: authorDid },
          none: { recipientDid },
        },
      },
    });

    expect(recentSessions).toHaveLength(1);
    expect(recentSessions[0].id).toBe(recentSessionId);
  });

  it('should skip sessions that already have recipient keys', async () => {
    const sessionId = uuidv4();

    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      },
    });

    // Add both author and recipient keys
    await prisma.sessionKey.createMany({
      data: [
        {
          sessionId,
          recipientDid: authorDid,
          encryptedDek: Buffer.from('author-dek'),
          userKeyPairId: '00000000-0000-0000-0000-000000000001',
        },
        {
          sessionId,
          recipientDid,
          encryptedDek: Buffer.from('recipient-dek'),
          userKeyPairId: '00000000-0000-0000-0000-000000000002',
        },
      ],
    });

    // Query should return empty (recipient already has key)
    const sessionsNeedingRecipient = await prisma.session.findMany({
      where: {
        authorDid,
        sessionKeys: {
          some: { recipientDid: authorDid },
          none: { recipientDid },
        },
      },
    });

    expect(sessionsNeedingRecipient).toHaveLength(0);
  });

  it('should create session key for new recipient', async () => {
    const sessionId = uuidv4();

    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      },
    });

    // Simulate adding recipient key (what handler does after crypto operations)
    await prisma.sessionKey.create({
      data: {
        sessionId,
        recipientDid,
        encryptedDek: Buffer.from('new-recipient-dek'),
        userKeyPairId: '00000000-0000-0000-0000-000000000002',
      },
    });

    const recipientKey = await prisma.sessionKey.findUnique({
      where: {
        sessionId_recipientDid: { sessionId, recipientDid },
      },
    });

    expect(recipientKey).toBeDefined();
    expect(recipientKey?.recipientDid).toBe(recipientDid);
  });
});
