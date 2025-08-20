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

const userDid = 'did:example:user';
const authorDid = 'did:example:author';
const testPostUri = `at://${authorDid}/social.spkeasy.privatePost/test-post`;

describe('Reactions API Tests', () => {
  let prisma: PrismaClient;
  const validToken = generateTestToken(userDid);

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
    await prisma.reaction.deleteMany();
    await prisma.encryptedPost.deleteMany();
    await prisma.sessionKey.deleteMany();
    await prisma.privateSession.deleteMany();
    
    // Setup mock for Bluesky session validation
    mockBlueskySession({ did: userDid, host: 'http://localhost:2583' });
  });

  afterEach(() => {
    // Cleanup and verify mocks
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  describe('POST /xrpc/social.spkeasy.reaction.createReaction', () => {
    it('should create a reaction successfully', async () => {
      // First create a post to react to
      const session = await prisma.privateSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: userDid,
              encryptedSessionKey: 'session-key',
            },
          },
        },
      });

      await prisma.encryptedPost.create({
        data: {
          uri: testPostUri,
          authorDid,
          sessionId: session.id,
          encryptedContent: 'post-content',
          createdAt: new Date(),
        },
      });

      const reactionData = {
        uri: testPostUri,
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.createReaction')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send(reactionData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('userDid', userDid);
      expect(response.body).toHaveProperty('postUri', testPostUri);

      // Verify reaction was stored in database
      const reaction = await prisma.reaction.findFirst({
        where: {
          userDid,
          postUri: testPostUri,
        },
      });
      
      expect(reaction).not.toBeNull();
      expect(reaction?.userDid).toBe(userDid);
      expect(reaction?.postUri).toBe(testPostUri);
    });

    it('should prevent duplicate reactions from same user', async () => {
      // Create a post and initial reaction
      const session = await prisma.privateSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: userDid,
              encryptedSessionKey: 'session-key',
            },
          },
        },
      });

      await prisma.encryptedPost.create({
        data: {
          uri: testPostUri,
          authorDid,
          sessionId: session.id,
          encryptedContent: 'post-content',
          createdAt: new Date(),
        },
      });

      await prisma.reaction.create({
        data: {
          userDid,
          postUri: testPostUri,
          createdAt: new Date(),
        },
      });

      // Try to create duplicate reaction
      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.createReaction')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ uri: testPostUri });

      // Should either return the existing reaction (200) or error (400/409)
      expect([200, 400, 409]).toContain(response.status);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.createReaction')
        .set('Content-Type', 'application/json')
        .send({ uri: testPostUri })
        .expect(401);
    });

    it('should require uri parameter', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.createReaction')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(400);
    });

    it('should validate uri format', async () => {
      const invalidUri = 'not-a-valid-uri';

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.createReaction')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ uri: invalidUri });

      // Should validate URI format
      expect([400, 500]).toContain(response.status);
    });
  });

  describe('POST /xrpc/social.spkeasy.reaction.deleteReaction', () => {
    it('should delete an existing reaction', async () => {
      // Create a reaction first
      const reaction = await prisma.reaction.create({
        data: {
          userDid,
          postUri: testPostUri,
          createdAt: new Date(),
        },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.deleteReaction')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ uri: testPostUri })
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');

      // Verify reaction was deleted from database
      const deletedReaction = await prisma.reaction.findFirst({
        where: {
          userDid,
          postUri: testPostUri,
        },
      });
      
      expect(deletedReaction).toBeNull();
    });

    it('should handle deleting non-existent reaction gracefully', async () => {
      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.deleteReaction')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ uri: testPostUri });

      // Should either succeed (200) or return not found (404)
      expect([200, 404]).toContain(response.status);
    });

    it('should only allow users to delete their own reactions', async () => {
      const otherUserDid = 'did:example:other-user';
      
      // Create reaction by other user
      await prisma.reaction.create({
        data: {
          userDid: otherUserDid,
          postUri: testPostUri,
          createdAt: new Date(),
        },
      });

      // Try to delete other user's reaction
      await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.deleteReaction')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ uri: testPostUri })
        .expect(200); // Should not delete other user's reaction

      // Verify other user's reaction still exists
      const otherReaction = await prisma.reaction.findFirst({
        where: {
          userDid: otherUserDid,
          postUri: testPostUri,
        },
      });
      
      expect(otherReaction).not.toBeNull();
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.deleteReaction')
        .set('Content-Type', 'application/json')
        .send({ uri: testPostUri })
        .expect(401);
    });

    it('should require uri parameter', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.deleteReaction')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(400);
    });

    it('should validate uri format', async () => {
      const invalidUri = 'not-a-valid-uri';

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.deleteReaction')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ uri: invalidUri });

      // Should validate URI format
      expect([400, 500]).toContain(response.status);
    });
  });

  describe('Reaction Integration Tests', () => {
    it('should create and delete reaction in sequence', async () => {
      // Create reaction
      const createResponse = await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.createReaction')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ uri: testPostUri })
        .expect(200);

      expect(createResponse.body).toHaveProperty('userDid', userDid);

      // Delete reaction
      const deleteResponse = await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.deleteReaction')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ uri: testPostUri })
        .expect(200);

      expect(deleteResponse.body).toHaveProperty('status', 'success');

      // Verify no reactions exist
      const reactions = await prisma.reaction.findMany({
        where: { userDid, postUri: testPostUri },
      });
      
      expect(reactions).toHaveLength(0);
    });

    it('should handle multiple reactions from different users', async () => {
      const otherUserDid = 'did:example:other-user';
      const otherUserToken = generateTestToken(otherUserDid);
      
      // Mock session for other user
      mockBlueskySession({ did: otherUserDid, host: 'http://localhost:2583' });

      // Create reactions from both users
      await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.createReaction')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ uri: testPostUri })
        .expect(200);

      await request(server.express)
        .post('/xrpc/social.spkeasy.reaction.createReaction')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .set('Content-Type', 'application/json')
        .send({ uri: testPostUri })
        .expect(200);

      // Verify both reactions exist
      const reactions = await prisma.reaction.findMany({
        where: { postUri: testPostUri },
        orderBy: { userDid: 'asc' },
      });
      
      expect(reactions).toHaveLength(2);
      expect(reactions[0].userDid).toBe(otherUserDid);
      expect(reactions[1].userDid).toBe(userDid);
    });
  });
});