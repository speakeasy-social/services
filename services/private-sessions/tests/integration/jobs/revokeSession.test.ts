import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import { createRevokeSessionHandler } from '../../../src/handlers/revokeSession.js';
import { v4 as uuidv4 } from 'uuid';

const authorDid = 'did:example:author';
const recipientDid = 'did:example:recipient';

describe('revokeSession handler', () => {
  let prisma: PrismaClient;
  let handler: ReturnType<typeof createRevokeSessionHandler>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    handler = createRevokeSessionHandler(prisma);
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

  it('should revoke all active sessions for an author', async () => {
    // Create test sessions
    const futureDate = new Date(Date.now() + 86400000); // 1 day from now
    const session1Id = uuidv4();
    const session2Id = uuidv4();

    await prisma.session.createMany({
      data: [
        {
          id: session1Id,
          authorDid,
          expiresAt: futureDate,
          revokedAt: null,
        },
        {
          id: session2Id,
          authorDid,
          expiresAt: futureDate,
          revokedAt: null,
        },
      ],
    });

    await handler({
      data: {
        authorDid,
      },
    });

    const sessions = await prisma.session.findMany({
      where: { authorDid },
    });

    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);
  });

  it('should not revoke already revoked sessions', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    const alreadyRevokedDate = new Date(Date.now() - 3600000); // 1 hour ago
    const sessionId = uuidv4();

    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid,
        expiresAt: futureDate,
        revokedAt: alreadyRevokedDate,
      },
    });

    await handler({
      data: {
        authorDid,
      },
    });

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    // Should keep the original revoked date
    expect(session?.revokedAt?.getTime()).toBe(alreadyRevokedDate.getTime());
  });

  it('should not revoke expired sessions', async () => {
    const pastDate = new Date(Date.now() - 86400000); // 1 day ago
    const sessionId = uuidv4();

    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid,
        expiresAt: pastDate,
        revokedAt: null,
      },
    });

    await handler({
      data: {
        authorDid,
      },
    });

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    // Should not revoke expired sessions
    expect(session?.revokedAt).toBeNull();
  });

  it('should delete session keys for specific recipient when recipientDid is provided', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    const sessionId = uuidv4();

    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid,
        expiresAt: futureDate,
        revokedAt: null,
      },
    });

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
          recipientDid: 'did:example:other-recipient',
          encryptedDek: Buffer.from('test-dek-2'),
          userKeyPairId: '00000000-0000-0000-0000-000000000002',
        },
      ],
    });

    await handler({
      data: {
        authorDid,
        recipientDid,
      },
    });

    const sessionKeys = await prisma.sessionKey.findMany({
      where: { sessionId },
    });

    // Should only delete keys for the specified recipient
    expect(sessionKeys).toHaveLength(1);
    expect(sessionKeys[0].recipientDid).toBe('did:example:other-recipient');
  });

  it('should not delete session keys when no recipientDid is provided', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    const sessionId = uuidv4();

    await prisma.session.create({
      data: {
        id: sessionId,
        authorDid,
        expiresAt: futureDate,
        revokedAt: null,
      },
    });

    await prisma.sessionKey.create({
      data: {
        sessionId,
        recipientDid,
        encryptedDek: Buffer.from('test-dek'),
        userKeyPairId: '00000000-0000-0000-0000-000000000001',
      },
    });

    await handler({
      data: {
        authorDid,
        // No recipientDid provided
      },
    });

    const sessionKeys = await prisma.sessionKey.findMany({
      where: { sessionId },
    });

    // Session keys should still exist
    expect(sessionKeys).toHaveLength(1);
  });
});
