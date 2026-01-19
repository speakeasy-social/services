import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import { v4 as uuidv4 } from 'uuid';

// Note: The deleteSessionKeys handler makes external calls to the trusted-users service.
// We test the database operations separately here.

const authorDid = 'did:example:author';
const recipientDid = 'did:example:recipient';

describe('deleteSessionKeys database operations', () => {
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

  it('should delete session keys for a specific recipient from author sessions', async () => {
    const sessionId = uuidv4();

    // Create test session
    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Create session key for recipient
    await prisma.sessionKey.create({
      data: {
        sessionId,
        recipientDid,
        encryptedDek: Buffer.from('test-dek'),
        userKeyPairId: '00000000-0000-0000-0000-000000000001',
      },
    });

    // Delete session keys (what handler does when recipient is no longer trusted)
    await prisma.sessionKey.deleteMany({
      where: {
        recipientDid,
        session: { authorDid },
      },
    });

    const sessionKeys = await prisma.sessionKey.findMany({
      where: { recipientDid },
    });

    expect(sessionKeys).toHaveLength(0);
  });

  it('should only delete keys from the specified author sessions', async () => {
    const otherAuthorDid = 'did:example:other-author';
    const session1Id = uuidv4();
    const session2Id = uuidv4();

    // Create sessions for two different authors
    await prisma.session.createMany({
      data: [
        {
          id: session1Id,
          authorDid,
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          id: session2Id,
          authorDid: otherAuthorDid,
          expiresAt: new Date(Date.now() + 86400000),
        },
      ],
    });

    // Create session keys for recipient in both sessions
    await prisma.sessionKey.createMany({
      data: [
        {
          sessionId: session1Id,
          recipientDid,
          encryptedDek: Buffer.from('test-dek-1'),
          userKeyPairId: '00000000-0000-0000-0000-000000000001',
        },
        {
          sessionId: session2Id,
          recipientDid,
          encryptedDek: Buffer.from('test-dek-2'),
          userKeyPairId: '00000000-0000-0000-0000-000000000002',
        },
      ],
    });

    // Delete session keys only for the first author
    await prisma.sessionKey.deleteMany({
      where: {
        recipientDid,
        session: { authorDid },
      },
    });

    const remainingKeys = await prisma.sessionKey.findMany({
      where: { recipientDid },
    });

    // Should only delete keys from the specified author's session
    expect(remainingKeys).toHaveLength(1);
    expect(remainingKeys[0].sessionId).toBe(session2Id);
  });

  it('should handle case when no session keys exist for recipient', async () => {
    const sessionId = uuidv4();

    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // No session keys created for recipient

    // Delete should complete without error
    const result = await prisma.sessionKey.deleteMany({
      where: {
        recipientDid,
        session: { authorDid },
      },
    });

    expect(result.count).toBe(0);
  });

  it('should preserve other recipients session keys', async () => {
    const otherRecipientDid = 'did:example:other-recipient';
    const sessionId = uuidv4();

    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Create session keys for both recipients
    await prisma.sessionKey.createMany({
      data: [
        {
          sessionId,
          recipientDid,
          encryptedDek: Buffer.from('test-dek-1'),
          userKeyPairId: '00000000-0000-0000-0000-000000000001',
        },
        {
          sessionId,
          recipientDid: otherRecipientDid,
          encryptedDek: Buffer.from('test-dek-2'),
          userKeyPairId: '00000000-0000-0000-0000-000000000002',
        },
      ],
    });

    // Delete only one recipient's keys
    await prisma.sessionKey.deleteMany({
      where: {
        recipientDid,
        session: { authorDid },
      },
    });

    const allKeys = await prisma.sessionKey.findMany({
      where: { sessionId },
    });

    // Other recipient's key should still exist
    expect(allKeys).toHaveLength(1);
    expect(allKeys[0].recipientDid).toBe(otherRecipientDid);
  });
});
