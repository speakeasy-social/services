import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import server from '../../../src/server.js';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import {
  mockBlueskySession,
  cleanupBlueskySessionMocks,
  verifyBlueskySessionMocks,
  generateTestToken,
} from '@speakeasy-services/test-utils';
import request from 'supertest';

const authorDid = 'did:example:alex-author';
const recipientDid = 'did:example:alice-recipient';

describe('Private Session API Tests', () => {
  let prisma: PrismaClient;
  const validToken = generateTestToken(authorDid);

  beforeAll(async () => {
    // Initialize Prisma client
    prisma = new PrismaClient();
    await prisma.$connect();

    // Start the server
    await server.start();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    // Mock process.exit to prevent test failures
    const originalExit = process.exit;
    process.exit = (() => {}) as any;

    try {
      // @ts-ignore - shutdown is private but we need it for tests
      await server.shutdown();
    } catch (error) {
      // Ignore shutdown errors during testing
    } finally {
      // Restore original process.exit
      process.exit = originalExit;
    }
  });

  beforeEach(async () => {
    // Clear test data before each test (order matters due to FK constraints)
    await prisma.reaction.deleteMany();
    await prisma.mediaPost.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.seenNotifications.deleteMany();
    await prisma.encryptedPost.deleteMany();
    await prisma.sessionKey.deleteMany();
    await prisma.session.deleteMany();

    // Setup mock for Bluesky session validation
    mockBlueskySession({ did: authorDid, host: 'http://localhost:2583' });
  });

  afterEach(() => {
    // Cleanup and verify mocks
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  describe('POST /xrpc/social.spkeasy.privateSession.create', () => {
    it('should create a new private session successfully', async () => {
      const sessionData = {
        sessionKeys: [
          {
            recipientDid: authorDid, // Author MUST be included as recipient
            encryptedDek: 'encrypted-session-key-data',
            userKeyPairId: '00000000-0000-0000-0000-000000000001',
          },
        ],
        expirationHours: 24,
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.create')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send(sessionData)
        .expect(200);

      expect(response.body).toHaveProperty('sessionId');

      // Verify session was created in DB
      const session = await prisma.session.findFirst({
        where: { authorDid },
        include: { sessionKeys: true },
      });
      expect(session).not.toBeNull();
      expect(session?.sessionKeys).toHaveLength(1);
      expect(session?.sessionKeys[0].recipientDid).toBe(authorDid);
    });

    it('should create session with multiple recipients', async () => {
      const sessionData = {
        sessionKeys: [
          {
            recipientDid: authorDid, // Author MUST be included
            encryptedDek: 'encrypted-session-key-author',
            userKeyPairId: '00000000-0000-0000-0000-000000000001',
          },
          {
            recipientDid,
            encryptedDek: 'encrypted-session-key-1',
            userKeyPairId: '00000000-0000-0000-0000-000000000002',
          },
          {
            recipientDid: 'did:example:bob-recipient',
            encryptedDek: 'encrypted-session-key-2',
            userKeyPairId: '00000000-0000-0000-0000-000000000003',
          },
        ],
        expirationHours: 48,
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.create')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send(sessionData)
        .expect(200);

      expect(response.body).toHaveProperty('sessionId');

      // Verify all recipients have session keys
      const session = await prisma.session.findFirst({
        where: { authorDid },
        include: { sessionKeys: true },
      });
      expect(session?.sessionKeys).toHaveLength(3);
    });

    it('should dedupe recipients with same recipientDid', async () => {
      const sessionData = {
        sessionKeys: [
          {
            recipientDid: authorDid,
            encryptedDek: 'encrypted-session-key-author-first',
            userKeyPairId: '00000000-0000-0000-0000-000000000001',
          },
          {
            recipientDid: authorDid, // Duplicate - should be ignored
            encryptedDek: 'encrypted-session-key-author-duplicate',
            userKeyPairId: '00000000-0000-0000-0000-000000000002',
          },
          {
            recipientDid,
            encryptedDek: 'encrypted-session-key-recipient',
            userKeyPairId: '00000000-0000-0000-0000-000000000003',
          },
        ],
        expirationHours: 24,
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.create')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send(sessionData)
        .expect(200);

      expect(response.body).toHaveProperty('sessionId');

      // Verify only unique recipients have session keys (2, not 3)
      const session = await prisma.session.findFirst({
        where: { authorDid },
        include: { sessionKeys: true },
      });
      expect(session?.sessionKeys).toHaveLength(2);

      // Verify the first occurrence was kept (check userKeyPairId)
      const authorKey = session?.sessionKeys.find(
        (key) => key.recipientDid === authorDid,
      );
      expect(authorKey?.userKeyPairId).toBe(
        '00000000-0000-0000-0000-000000000001',
      );
    });

    it('should reject session creation when author is not in recipients', async () => {
      const sessionData = {
        sessionKeys: [
          {
            recipientDid, // Author NOT included - should fail
            encryptedDek: 'encrypted-session-key-data',
            userKeyPairId: '00000000-0000-0000-0000-000000000001',
          },
        ],
        expirationHours: 24,
      };

      await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.create')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send(sessionData)
        .expect(400);
    });

    it('should require authentication', async () => {
      const sessionData = {
        sessionKeys: [
          {
            recipientDid,
            encryptedDek: 'encrypted-session-key-data',
            userKeyPairId: '00000000-0000-0000-0000-000000000001',
          },
        ],
      };

      await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.create')
        .set('Content-Type', 'application/json')
        .send(sessionData)
        .expect(401);
    });

    it('should validate session keys format', async () => {
      const invalidData = {
        sessionKeys: 'invalid-format',
      };

      await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.create')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send(invalidData)
        .expect(400);
    });
  });

  describe('POST /xrpc/social.spkeasy.privateSession.revoke', () => {
    it('should revoke an existing session', async () => {
      // Create a session with author's own key
      await prisma.session.create({
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
        .post('/xrpc/social.spkeasy.privateSession.revoke')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ authorDid })
        .expect(200);

      expect(response.body).toEqual({ success: true });

      // Verify session was revoked
      const session = await prisma.session.findFirst({ where: { authorDid } });
      expect(session?.revokedAt).not.toBeNull();
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.revoke')
        .set('Content-Type', 'application/json')
        .send({ authorDid })
        .expect(401);
    });

    it('should validate authorDid parameter', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.revoke')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({}) // Missing authorDid
        .expect(400);
    });
  });

  describe('GET /xrpc/social.spkeasy.privateSession.getSession', () => {
    it('should retrieve current session for user', async () => {
      // Create a session with a session key for the user
      await prisma.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid, // User's own session key
              encryptedDek: Buffer.from('user-session-key'),
              userKeyPairId: '00000000-0000-0000-0000-000000000001', // Use proper UUID format
            },
          },
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.privateSession.getSession')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('encryptedSessionKey');
      expect(response.body.encryptedSessionKey).toHaveProperty(
        'recipientDid',
        authorDid,
      );
    });

    it('should require authentication', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.privateSession.getSession')
        .expect(401);
    });
  });

  describe('POST /xrpc/social.spkeasy.privateSession.addUser', () => {
    it('should add a user to an existing session', async () => {
      // Create an existing session with author's key
      await prisma.session.create({
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
        encryptedDek: 'new-encrypted-keys',
        userKeyPairId: '00000000-0000-0000-0000-000000000003',
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.addUser')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send(newRecipientData)
        .expect(200);

      expect(response.body).toEqual({ success: true });

      // Verify recipient was added
      const session = await prisma.session.findFirst({
        where: { authorDid },
        include: { sessionKeys: true },
      });
      expect(session?.sessionKeys).toHaveLength(2);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.addUser')
        .set('Content-Type', 'application/json')
        .send({
          recipientDid: 'did:example:test',
          encryptedDek: 'test-key',
          userKeyPairId: '00000000-0000-0000-0000-000000000004',
        })
        .expect(401);
    });
  });

  describe('POST /xrpc/social.spkeasy.privateSession.updateKeys', () => {
    // NOTE: This endpoint requires service authentication (user-keys service only)
    // Regular user auth is forbidden - this is a service-to-service call
    it('should reject user auth (requires service auth from user-keys)', async () => {
      const updateData = {
        prevKeyId: '00000000-0000-0000-0000-000000000001',
        newKeyId: '00000000-0000-0000-0000-000000000002',
        prevPrivateKey: 'base64-encoded-previous-private-key',
        newPublicKey: 'base64-encoded-new-public-key',
      };

      // This endpoint is only callable by user-keys service
      // Regular user auth should be forbidden
      await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.updateKeys')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send(updateData)
        .expect(403); // Forbidden - requires service auth
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.updateKeys')
        .set('Content-Type', 'application/json')
        .send({
          prevKeyId: '00000000-0000-0000-0000-000000000001',
          newKeyId: '00000000-0000-0000-0000-000000000002',
          prevPrivateKey: 'key',
          newPublicKey: 'key',
        })
        .expect(401);
    });

    it('should validate required fields', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.updateKeys')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({}) // Missing required fields
        .expect(400);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      await request(server.express).get('/health').expect(200);
    });
  });
});
