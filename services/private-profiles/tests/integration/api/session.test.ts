import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import server from '../../../dist/server.js';
import { PrismaClient } from '../../../dist/generated/prisma-client/index.js';
import {
  mockBlueskySession,
  cleanupBlueskySessionMocks,
  verifyBlueskySessionMocks,
  generateTestToken,
} from '@speakeasy-services/test-utils';
import request from 'supertest';

const authorDid = 'did:example:profile-author';
const recipientDid = 'did:example:profile-recipient';

describe('Profile Session API Tests', () => {
  let prisma: PrismaClient;
  const authorToken = generateTestToken(authorDid);
  const recipientToken = generateTestToken(recipientDid);

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await server.start();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      // @ts-ignore - shutdown is private but we need it for tests
      await server.shutdown();
    } catch {
      // Ignore shutdown errors during testing
    } finally {
      process.exit = originalExit;
    }
  });

  beforeEach(async () => {
    // Clear test data before each test
    await prisma.privateProfile.deleteMany();
    await prisma.profileSessionKey.deleteMany();
    await prisma.profileSession.deleteMany();

    mockBlueskySession({ did: authorDid, host: 'http://localhost:2583' });
  });

  afterEach(() => {
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  describe('POST /xrpc/social.spkeasy.profileSession.create', () => {
    it('should create a new profile session with author as recipient', async () => {
      const sessionData = {
        sessionKeys: [
          {
            recipientDid: authorDid,
            encryptedDek: 'encrypted-session-key-for-author',
            userKeyPairId: '00000000-0000-0000-0000-000000000001',
          },
        ],
        expirationHours: 24,
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.create')
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Content-Type', 'application/json')
        .send(sessionData)
        .expect(200);

      expect(response.body).toHaveProperty('sessionId');
      expect(typeof response.body.sessionId).toBe('string');

      // Verify session was created in database
      const session = await prisma.profileSession.findFirst({
        where: { authorDid },
        include: { sessionKeys: true },
      });
      expect(session).not.toBeNull();
      expect(session?.sessionKeys).toHaveLength(1);
      expect(session?.sessionKeys[0].recipientDid).toBe(authorDid);
    });

    it('should create session with multiple recipients including author', async () => {
      const sessionData = {
        sessionKeys: [
          {
            recipientDid: authorDid,
            encryptedDek: 'encrypted-session-key-for-author',
            userKeyPairId: '00000000-0000-0000-0000-000000000001',
          },
          {
            recipientDid: recipientDid,
            encryptedDek: 'encrypted-session-key-for-recipient',
            userKeyPairId: '00000000-0000-0000-0000-000000000002',
          },
        ],
        expirationHours: 48,
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.create')
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Content-Type', 'application/json')
        .send(sessionData)
        .expect(200);

      expect(response.body).toHaveProperty('sessionId');

      // Verify both session keys were created
      const sessionKeys = await prisma.profileSessionKey.findMany({
        where: { sessionId: response.body.sessionId },
      });
      expect(sessionKeys).toHaveLength(2);
    });

    it('should require authentication', async () => {
      const sessionData = {
        sessionKeys: [
          {
            recipientDid: authorDid,
            encryptedDek: 'encrypted-session-key-data',
            userKeyPairId: '00000000-0000-0000-0000-000000000001',
          },
        ],
      };

      await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.create')
        .set('Content-Type', 'application/json')
        .send(sessionData)
        .expect(401);
    });

    it('should validate session keys format', async () => {
      const invalidData = {
        sessionKeys: 'invalid-format',
      };

      await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.create')
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Content-Type', 'application/json')
        .send(invalidData)
        .expect(400);
    });
  });

  describe('GET /xrpc/social.spkeasy.profileSession.getSession', () => {
    it('should retrieve current session key for user', async () => {
      // Create a session with a session key for the author
      await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              encryptedDek: Buffer.from('author-session-key'),
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
            },
          },
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.profileSession.getSession')
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('encryptedSessionKey');
      expect(response.body.encryptedSessionKey).toHaveProperty('recipientDid', authorDid);
      expect(response.body.encryptedSessionKey).toHaveProperty('encryptedDek');
    });

    it('should require authentication', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.profileSession.getSession')
        .expect(401);
    });
  });

  describe('POST /xrpc/social.spkeasy.profileSession.addUser', () => {
    it('should add a user to existing session', async () => {
      // Create an existing session
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              encryptedDek: Buffer.from('existing-key'),
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
            },
          },
        },
      });

      const newRecipientData = {
        recipientDid: 'did:example:new-recipient',
        encryptedDek: 'new-encrypted-key-base64',
        userKeyPairId: '00000000-0000-0000-0000-000000000003',
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.addUser')
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Content-Type', 'application/json')
        .send(newRecipientData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify the new session key was created
      const sessionKeys = await prisma.profileSessionKey.findMany({
        where: { sessionId: session.id },
      });
      expect(sessionKeys).toHaveLength(2);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.addUser')
        .set('Content-Type', 'application/json')
        .send({
          recipientDid: 'did:example:test',
          encryptedDek: 'test-key',
          userKeyPairId: '00000000-0000-0000-0000-000000000004',
        })
        .expect(401);
    });
  });

  describe('POST /xrpc/social.spkeasy.profileSession.revoke', () => {
    it('should revoke an existing session', async () => {
      // Create a session
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              encryptedDek: Buffer.from('test-key'),
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
            },
          },
        },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.revoke')
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Content-Type', 'application/json')
        .send({ authorDid })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify session was revoked
      const revokedSession = await prisma.profileSession.findUnique({
        where: { id: session.id },
      });
      expect(revokedSession?.revokedAt).not.toBeNull();
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.revoke')
        .set('Content-Type', 'application/json')
        .send({ authorDid })
        .expect(401);
    });
  });

  describe('POST /xrpc/social.spkeasy.profileSession.updateKeys', () => {
    it('should queue key rotation job', async () => {
      const updateKeysData = {
        prevKeyId: '00000000-0000-0000-0000-000000000001',
        newKeyId: '00000000-0000-0000-0000-000000000002',
        prevPrivateKey: 'base64-encoded-prev-private-key',
        newPublicKey: 'base64-encoded-new-public-key',
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.updateKeys')
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Content-Type', 'application/json')
        .send(updateKeysData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.updateKeys')
        .set('Content-Type', 'application/json')
        .send({
          prevKeyId: '00000000-0000-0000-0000-000000000001',
          newKeyId: '00000000-0000-0000-0000-000000000002',
          prevPrivateKey: 'test-key',
          newPublicKey: 'test-key',
        })
        .expect(401);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      await request(server.express)
        .get('/health')
        .expect(200);
    });
  });
});
