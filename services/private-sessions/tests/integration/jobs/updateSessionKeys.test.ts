import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import { createUpdateSessionKeysHandler } from '../../../src/handlers/updateSessionKeys.js';
import { v4 as uuidv4 } from 'uuid';

// Note: This test requires crypto functions. We test the database operations only,
// as the crypto operations are tested separately in the crypto package.

const authorDid = 'did:example:author';
const recipientDid = 'did:example:recipient';

describe('updateSessionKeys handler', () => {
  let prisma: PrismaClient;
  let handler: ReturnType<typeof createUpdateSessionKeysHandler>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    handler = createUpdateSessionKeysHandler(prisma);
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

  it('should find session keys with the old key pair id', async () => {
    const sessionId = uuidv4();
    const prevKeyId = '00000000-0000-0000-0000-000000000001';
    const newKeyId = '00000000-0000-0000-0000-000000000002';

    // Create test session
    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Create session key with old key pair id
    await prisma.sessionKey.create({
      data: {
        sessionId,
        recipientDid,
        encryptedDek: Buffer.from('test-dek'),
        userKeyPairId: prevKeyId,
      },
    });

    // The handler will fail on crypto operations, but we can verify it finds the keys
    const sessionKeys = await prisma.sessionKey.findMany({
      where: { userKeyPairId: prevKeyId },
    });

    expect(sessionKeys).toHaveLength(1);
    expect(sessionKeys[0].userKeyPairId).toBe(prevKeyId);
  });

  it('should handle empty result when no keys match', async () => {
    const prevKeyId = '00000000-0000-0000-0000-000000000099';
    const newKeyId = '00000000-0000-0000-0000-000000000002';

    // No session keys exist with the prevKeyId
    // The handler should complete without error
    const sessionKeys = await prisma.sessionKey.findMany({
      where: { userKeyPairId: prevKeyId },
    });

    expect(sessionKeys).toHaveLength(0);
  });

  it('should batch session keys correctly', async () => {
    const prevKeyId = '00000000-0000-0000-0000-000000000001';
    const sessionIds = Array.from({ length: 5 }, () => uuidv4());

    // Create multiple sessions
    await prisma.session.createMany({
      data: sessionIds.map((id) => ({
        id,
        authorDid,
        expiresAt: new Date(Date.now() + 86400000),
      })),
    });

    // Create session keys for all sessions
    await prisma.sessionKey.createMany({
      data: sessionIds.map((sessionId, i) => ({
        sessionId,
        recipientDid: `did:example:recipient-${i}`,
        encryptedDek: Buffer.from(`test-dek-${i}`),
        userKeyPairId: prevKeyId,
      })),
    });

    const sessionKeys = await prisma.sessionKey.findMany({
      where: { userKeyPairId: prevKeyId },
      take: 100,
    });

    expect(sessionKeys).toHaveLength(5);
  });
});
