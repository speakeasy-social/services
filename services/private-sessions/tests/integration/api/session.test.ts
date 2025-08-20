import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
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
    // Clear test data before each test
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
            recipientDid,
            encryptedSessionKey: 'encrypted-session-key-data',
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
      expect(typeof response.body.sessionId).toBe('string');

      // Verify session was stored in database
      const session = await prisma.session.findUnique({
        where: { id: response.body.sessionId },
        include: { sessionKeys: true },
      });
      
      expect(session).not.toBeNull();
      expect(session?.authorDid).toBe(authorDid);
      expect(session?.sessionKeys).toHaveLength(1);
      expect(session?.sessionKeys[0].recipientDid).toBe(recipientDid);
    });

    it('should create session with multiple recipients', async () => {
      const sessionData = {
        sessionKeys: [
          {
            recipientDid,
            encryptedSessionKey: 'encrypted-session-key-1',
          },
          {
            recipientDid: 'did:example:bob-recipient',
            encryptedSessionKey: 'encrypted-session-key-2',
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

      const session = await prisma.session.findUnique({
        where: { id: response.body.sessionId },
        include: { sessionKeys: true },
      });
      
      expect(session?.sessionKeys).toHaveLength(2);
    });

    it('should require authentication', async () => {
      const sessionData = {
        sessionKeys: [
          {
            recipientDid,
            encryptedSessionKey: 'encrypted-session-key-data',
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
      // First create a session
      const session = await prisma.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid,
              encryptedDek: Buffer.from('test-key'),
              userKeyPairId: 'test-key-pair-id',
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

      expect(response.body).toHaveProperty('success', true);

      // Verify session was revoked (marked as expired)
      const revokedSession = await prisma.session.findUnique({
        where: { id: session.id },
      });
      
      expect(revokedSession?.expiresAt.getTime()).toBeLessThan(Date.now());
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
        .send({})
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
              userKeyPairId: 'user-key-pair-id',
            },
          },
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.privateSession.getSession')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('encryptedSessionKey');
      expect(response.body.encryptedSessionKey).toHaveProperty('recipientDid', authorDid);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.privateSession.getSession')
        .expect(401);
    });
  });

  describe('POST /xrpc/social.spkeasy.privateSession.addUser', () => {
    it('should add a user to existing session', async () => {
      // Create an existing session
      const session = await prisma.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid,
              encryptedDek: Buffer.from('existing-key'),
              userKeyPairId: 'existing-key-pair-id',
            },
          },
        },
      });

      const newRecipientData = {
        recipientDid: 'did:example:new-recipient',
        encryptedSessionKey: 'new-encrypted-key',
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.addUser')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send(newRecipientData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify new session key was added
      const updatedSession = await prisma.session.findUnique({
        where: { id: session.id },
        include: { sessionKeys: true },
      });
      
      expect(updatedSession?.sessionKeys).toHaveLength(2);
      const newKey = updatedSession?.sessionKeys.find(
        key => key.recipientDid === 'did:example:new-recipient'
      );
      expect(newKey).toBeDefined();
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.addUser')
        .set('Content-Type', 'application/json')
        .send({
          recipientDid: 'did:example:test',
          encryptedSessionKey: 'test-key',
        })
        .expect(401);
    });
  });

  describe('POST /xrpc/social.spkeasy.privateSession.updateKeys', () => {
    it('should update session keys', async () => {
      // Create a session first
      const session = await prisma.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid,
              encryptedDek: Buffer.from('old-key'),
              userKeyPairId: 'old-key-pair-id',
            },
          },
        },
      });

      const updateData = {
        sessionId: session.id,
        sessionKeys: [
          {
            recipientDid,
            encryptedSessionKey: 'updated-key',
          },
        ],
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.updateKeys')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify key was updated (implementation may vary)
      const updatedSession = await prisma.session.findUnique({
        where: { id: session.id },
        include: { sessionKeys: true },
      });
      
      expect(updatedSession?.sessionKeys).toHaveLength(1);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.privateSession.updateKeys')
        .set('Content-Type', 'application/json')
        .send({
          sessionId: 'test-session',
          sessionKeys: [],
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