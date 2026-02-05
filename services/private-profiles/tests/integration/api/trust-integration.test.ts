import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaClient } from '../../../dist/generated/prisma-client/index.js';
import {
  createAddRecipientToSessionHandler,
  createDeleteSessionKeysHandler,
  createRevokeSessionHandler,
} from '@speakeasy-services/session-management';

const authorDid = 'did:example:trust-author';
const recipientDid = 'did:example:trust-recipient';
const SERVICE_NAME = 'private-profiles';

// Mock the external service calls
vi.mock('@speakeasy-services/common', async () => {
  const actual = await vi.importActual('@speakeasy-services/common');
  return {
    ...actual,
    speakeasyApiRequest: vi.fn(),
  };
});

// Mock crypto functions
vi.mock('@speakeasy-services/crypto', async () => {
  const actual = await vi.importActual('@speakeasy-services/crypto');
  return {
    ...actual,
    recryptDEK: vi.fn().mockResolvedValue(Buffer.from('re-encrypted-dek')),
  };
});

import { speakeasyApiRequest } from '@speakeasy-services/common';

describe('Trust Integration Tests', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await prisma.privateProfile.deleteMany();
    await prisma.profileSessionKey.deleteMany();
    await prisma.profileSession.deleteMany();

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('Add Recipient to Session (Trust Event)', () => {
    it('should add session key for new trusted user', async () => {
      // Setup: Create a session with author's session key
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              encryptedDek: Buffer.from('author-encrypted-dek'),
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
            },
          },
        },
      });

      // Mock trusted-users API response (recipient is trusted)
      vi.mocked(speakeasyApiRequest).mockImplementation(async (config, params) => {
        if (config.path === 'social.spkeasy.graph.getTrusted') {
          return { trusted: [{ did: recipientDid }] };
        }
        if (config.path === 'social.spkeasy.key.getPrivateKeys') {
          return {
            keys: [
              {
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
                privateKey: 'mock-private-key',
              },
            ],
          };
        }
        if (config.path === 'social.spkeasy.key.getPublicKey') {
          return {
            userKeyPairId: '00000000-0000-0000-0000-000000000002',
            publicKey: 'mock-public-key',
          };
        }
        return {};
      });

      // Execute handler
      const handler = createAddRecipientToSessionHandler(prisma, {
        serviceName: SERVICE_NAME,
        currentSessionOnly: true,
      });

      await handler({ data: { authorDid, recipientDid } } as any);

      // Verify: Session key was created for the recipient
      const sessionKeys = await prisma.profileSessionKey.findMany({
        where: { sessionId: session.id },
      });

      expect(sessionKeys).toHaveLength(2);
      const recipientKey = sessionKeys.find((sk) => sk.recipientDid === recipientDid);
      expect(recipientKey).toBeDefined();
      expect(recipientKey?.userKeyPairId).toBe('00000000-0000-0000-0000-000000000002');
    });

    it('should abort if recipient is no longer trusted', async () => {
      // Setup: Create a session with author's session key
      await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              encryptedDek: Buffer.from('author-encrypted-dek'),
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
            },
          },
        },
      });

      // Mock: Recipient is NOT trusted
      vi.mocked(speakeasyApiRequest).mockResolvedValue({ trusted: [] });

      // Execute handler
      const handler = createAddRecipientToSessionHandler(prisma, {
        serviceName: SERVICE_NAME,
        currentSessionOnly: true,
      });

      const result = await handler({ data: { authorDid, recipientDid } } as any);

      // Verify: Handler aborted and no key was created
      expect(result).toEqual({ abortReason: 'Recipient no longer trusted' });

      const sessionKeys = await prisma.profileSessionKey.findMany({
        where: { recipientDid },
      });
      expect(sessionKeys).toHaveLength(0);
    });

    it('should not create duplicate session keys', async () => {
      // Setup: Create a session with both author and recipient already having keys
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: [
              {
                recipientDid: authorDid,
                encryptedDek: Buffer.from('author-encrypted-dek'),
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
              },
              {
                recipientDid: recipientDid,
                encryptedDek: Buffer.from('recipient-encrypted-dek'),
                userKeyPairId: '00000000-0000-0000-0000-000000000002',
              },
            ],
          },
        },
      });

      // Mock: Recipient is trusted
      vi.mocked(speakeasyApiRequest).mockResolvedValue({ trusted: [{ did: recipientDid }] });

      // Execute handler
      const handler = createAddRecipientToSessionHandler(prisma, {
        serviceName: SERVICE_NAME,
        currentSessionOnly: true,
      });

      await handler({ data: { authorDid, recipientDid } } as any);

      // Verify: Still only 2 session keys (no duplicates)
      const sessionKeys = await prisma.profileSessionKey.findMany({
        where: { sessionId: session.id },
      });
      expect(sessionKeys).toHaveLength(2);
    });

    it('should only add key to most recent session (currentSessionOnly=true for profiles)', async () => {
      // Setup: Create two sessions
      const oldSession = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              encryptedDek: Buffer.from('old-session-key'),
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
            },
          },
        },
      });

      const newSession = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdAt: new Date(), // Now
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              encryptedDek: Buffer.from('new-session-key'),
              userKeyPairId: '00000000-0000-0000-0000-000000000002',
            },
          },
        },
      });

      // Mock external services
      vi.mocked(speakeasyApiRequest).mockImplementation(async (config) => {
        if (config.path === 'social.spkeasy.graph.getTrusted') {
          return { trusted: [{ did: recipientDid }] };
        }
        if (config.path === 'social.spkeasy.key.getPrivateKeys') {
          return {
            keys: [
              {
                userKeyPairId: '00000000-0000-0000-0000-000000000002',
                privateKey: 'mock-private-key',
              },
            ],
          };
        }
        if (config.path === 'social.spkeasy.key.getPublicKey') {
          return {
            userKeyPairId: '00000000-0000-0000-0000-000000000003',
            publicKey: 'mock-public-key',
          };
        }
        return {};
      });

      // Execute handler with currentSessionOnly=true
      const handler = createAddRecipientToSessionHandler(prisma, {
        serviceName: SERVICE_NAME,
        currentSessionOnly: true,
      });

      await handler({ data: { authorDid, recipientDid } } as any);

      // Verify: Key only added to new session, not old session
      const oldSessionKeys = await prisma.profileSessionKey.findMany({
        where: { sessionId: oldSession.id },
      });
      expect(oldSessionKeys).toHaveLength(1); // Only author's key

      const newSessionKeys = await prisma.profileSessionKey.findMany({
        where: { sessionId: newSession.id },
      });
      expect(newSessionKeys).toHaveLength(2); // Author + recipient
    });
  });

  describe('Delete Session Keys (Untrust Event)', () => {
    it('should delete session keys for untrusted user', async () => {
      // Setup: Create a session with recipient having a key
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: [
              {
                recipientDid: authorDid,
                encryptedDek: Buffer.from('author-key'),
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
              },
              {
                recipientDid: recipientDid,
                encryptedDek: Buffer.from('recipient-key'),
                userKeyPairId: '00000000-0000-0000-0000-000000000002',
              },
            ],
          },
        },
      });

      // Mock: Recipient is NOT trusted (was removed)
      vi.mocked(speakeasyApiRequest).mockResolvedValue({ trusted: [] });

      // Execute handler
      const handler = createDeleteSessionKeysHandler(prisma, {
        serviceName: SERVICE_NAME,
      });

      await handler({ data: { authorDid, recipientDid } } as any);

      // Verify: Recipient's session key was deleted
      const sessionKeys = await prisma.profileSessionKey.findMany({
        where: { sessionId: session.id },
      });
      expect(sessionKeys).toHaveLength(1);
      expect(sessionKeys[0].recipientDid).toBe(authorDid);
    });

    it('should abort if recipient was re-trusted', async () => {
      // Setup: Create a session with recipient having a key
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: [
              {
                recipientDid: authorDid,
                encryptedDek: Buffer.from('author-key'),
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
              },
              {
                recipientDid: recipientDid,
                encryptedDek: Buffer.from('recipient-key'),
                userKeyPairId: '00000000-0000-0000-0000-000000000002',
              },
            ],
          },
        },
      });

      // Mock: Recipient is still/again trusted
      vi.mocked(speakeasyApiRequest).mockResolvedValue({ trusted: [{ did: recipientDid }] });

      // Execute handler
      const handler = createDeleteSessionKeysHandler(prisma, {
        serviceName: SERVICE_NAME,
      });

      const result = await handler({ data: { authorDid, recipientDid } } as any);

      // Verify: Handler aborted and keys preserved
      expect(result).toEqual({ abortReason: 'Recipient has been trusted again' });

      const sessionKeys = await prisma.profileSessionKey.findMany({
        where: { sessionId: session.id },
      });
      expect(sessionKeys).toHaveLength(2);
    });

    it('should delete keys across all sessions for the author', async () => {
      // Setup: Create two sessions with recipient having keys in both
      const session1 = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: [
              {
                recipientDid: authorDid,
                encryptedDek: Buffer.from('author-key-1'),
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
              },
              {
                recipientDid: recipientDid,
                encryptedDek: Buffer.from('recipient-key-1'),
                userKeyPairId: '00000000-0000-0000-0000-000000000002',
              },
            ],
          },
        },
      });

      const session2 = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          sessionKeys: {
            create: [
              {
                recipientDid: authorDid,
                encryptedDek: Buffer.from('author-key-2'),
                userKeyPairId: '00000000-0000-0000-0000-000000000003',
              },
              {
                recipientDid: recipientDid,
                encryptedDek: Buffer.from('recipient-key-2'),
                userKeyPairId: '00000000-0000-0000-0000-000000000004',
              },
            ],
          },
        },
      });

      // Mock: Recipient is NOT trusted
      vi.mocked(speakeasyApiRequest).mockResolvedValue({ trusted: [] });

      // Execute handler
      const handler = createDeleteSessionKeysHandler(prisma, {
        serviceName: SERVICE_NAME,
      });

      await handler({ data: { authorDid, recipientDid } } as any);

      // Verify: Recipient's keys deleted from all sessions
      const recipientKeys = await prisma.profileSessionKey.findMany({
        where: { recipientDid },
      });
      expect(recipientKeys).toHaveLength(0);

      // Author's keys should still exist
      const authorKeys = await prisma.profileSessionKey.findMany({
        where: { recipientDid: authorDid },
      });
      expect(authorKeys).toHaveLength(2);
    });
  });

  describe('Revoke Session', () => {
    it('should revoke active sessions for author', async () => {
      // Setup: Create an active session
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              encryptedDek: Buffer.from('author-key'),
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
            },
          },
        },
      });

      // Execute handler
      const handler = createRevokeSessionHandler(prisma);

      await handler({ data: { authorDid } } as any);

      // Verify: Session was revoked
      const revokedSession = await prisma.profileSession.findUnique({
        where: { id: session.id },
      });
      expect(revokedSession?.revokedAt).not.toBeNull();
    });

    it('should delete recipient keys when recipientDid is specified', async () => {
      // Setup: Create a session with recipient
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: [
              {
                recipientDid: authorDid,
                encryptedDek: Buffer.from('author-key'),
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
              },
              {
                recipientDid: recipientDid,
                encryptedDek: Buffer.from('recipient-key'),
                userKeyPairId: '00000000-0000-0000-0000-000000000002',
              },
            ],
          },
        },
      });

      // Execute handler with recipientDid
      const handler = createRevokeSessionHandler(prisma);

      await handler({ data: { authorDid, recipientDid } } as any);

      // Verify: Session revoked and recipient's key deleted
      const sessionKeys = await prisma.profileSessionKey.findMany({
        where: { sessionId: session.id },
      });
      expect(sessionKeys).toHaveLength(1);
      expect(sessionKeys[0].recipientDid).toBe(authorDid);
    });

    it('should not revoke already revoked sessions', async () => {
      // Setup: Create an already revoked session
      const revokedAt = new Date(Date.now() - 1000);
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          revokedAt,
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              encryptedDek: Buffer.from('author-key'),
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
            },
          },
        },
      });

      // Execute handler
      const handler = createRevokeSessionHandler(prisma);

      await handler({ data: { authorDid } } as any);

      // Verify: Original revocation time preserved (updateMany skips already revoked)
      const checkedSession = await prisma.profileSession.findUnique({
        where: { id: session.id },
      });
      expect(checkedSession?.revokedAt?.getTime()).toBe(revokedAt.getTime());
    });
  });
});
