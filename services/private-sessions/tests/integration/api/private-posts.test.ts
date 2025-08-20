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
const testPostUri = `at://${authorDid}/social.spkeasy.privatePost/test-post`;

describe('Private Posts API Tests', () => {
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
    await prisma.encryptedPost.deleteMany();
    await prisma.sessionKey.deleteMany();
    await prisma.privateSession.deleteMany();
    
    // Setup mock for Bluesky session validation
    mockBlueskySession({ did: authorDid, host: 'http://localhost:2583' });
  });

  afterEach(() => {
    // Cleanup and verify mocks
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  describe('POST /xrpc/social.spkeasy.privatePost.createPosts', () => {
    it('should create encrypted posts successfully', async () => {
      // First create a session
      const session = await prisma.privateSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid,
              encryptedSessionKey: 'session-key',
            },
          },
        },
      });

      const postData = {
        sessionId: session.id,
        encryptedPosts: [
          {
            uri: testPostUri,
            encryptedContent: 'encrypted-post-content',
            createdAt: new Date().toISOString(),
            replyTo: null,
          },
        ],
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.privatePost.createPosts')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send(postData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify post was stored in database
      const post = await prisma.encryptedPost.findUnique({
        where: { uri: testPostUri },
      });
      
      expect(post).not.toBeNull();
      expect(post?.authorDid).toBe(authorDid);
      expect(post?.encryptedContent).toBe('encrypted-post-content');
    });

    it('should create posts with reply relationships', async () => {
      // Create parent post first
      const parentUri = `at://${authorDid}/social.spkeasy.privatePost/parent-post`;
      const session = await prisma.privateSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid,
              encryptedSessionKey: 'session-key',
            },
          },
        },
      });

      await prisma.encryptedPost.create({
        data: {
          uri: parentUri,
          authorDid,
          sessionId: session.id,
          encryptedContent: 'parent-post-content',
          createdAt: new Date(),
        },
      });

      const replyData = {
        sessionId: session.id,
        encryptedPosts: [
          {
            uri: testPostUri,
            encryptedContent: 'encrypted-reply-content',
            createdAt: new Date().toISOString(),
            replyTo: parentUri,
          },
        ],
      };

      await request(server.express)
        .post('/xrpc/social.spkeasy.privatePost.createPosts')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send(replyData)
        .expect(200);

      // Verify reply relationship
      const replyPost = await prisma.encryptedPost.findUnique({
        where: { uri: testPostUri },
      });
      
      expect(replyPost?.replyTo).toBe(parentUri);
    });

    it('should require authentication', async () => {
      const postData = {
        sessionId: 'test-session',
        encryptedPosts: [
          {
            uri: testPostUri,
            encryptedContent: 'content',
            createdAt: new Date().toISOString(),
          },
        ],
      };

      await request(server.express)
        .post('/xrpc/social.spkeasy.privatePost.createPosts')
        .set('Content-Type', 'application/json')
        .send(postData)
        .expect(401);
    });

    it('should validate post data format', async () => {
      const invalidData = {
        sessionId: 'test-session',
        encryptedPosts: 'invalid-format',
      };

      await request(server.express)
        .post('/xrpc/social.spkeasy.privatePost.createPosts')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send(invalidData)
        .expect(400);
    });
  });

  describe('GET /xrpc/social.spkeasy.privatePost.getPosts', () => {
    it('should retrieve encrypted posts for user', async () => {
      // Create session and posts
      const session = await prisma.privateSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: [
              {
                recipientDid: authorDid, // User's own key
                encryptedSessionKey: 'user-session-key',
              },
              {
                recipientDid,
                encryptedSessionKey: 'recipient-key',
              },
            ],
          },
        },
      });

      await prisma.encryptedPost.create({
        data: {
          uri: testPostUri,
          authorDid,
          sessionId: session.id,
          encryptedContent: 'encrypted-content',
          createdAt: new Date(),
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.privatePost.getPosts')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ limit: '10' })
        .expect(200);

      expect(response.body).toHaveProperty('encryptedPosts');
      expect(response.body).toHaveProperty('encryptedSessionKeys');
      expect(response.body.encryptedPosts).toHaveLength(1);
      expect(response.body.encryptedPosts[0]).toHaveProperty('uri', testPostUri);
    });

    it('should filter posts by author', async () => {
      const otherAuthor = 'did:example:other-author';
      
      // Create sessions and posts for different authors
      const session1 = await prisma.privateSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              encryptedSessionKey: 'key1',
            },
          },
        },
      });

      const session2 = await prisma.privateSession.create({
        data: {
          authorDid: otherAuthor,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid, // User can see this post
              encryptedSessionKey: 'key2',
            },
          },
        },
      });

      await prisma.encryptedPost.createMany({
        data: [
          {
            uri: testPostUri,
            authorDid,
            sessionId: session1.id,
            encryptedContent: 'content1',
            createdAt: new Date(),
          },
          {
            uri: `at://${otherAuthor}/social.spkeasy.privatePost/other-post`,
            authorDid: otherAuthor,
            sessionId: session2.id,
            encryptedContent: 'content2',
            createdAt: new Date(),
          },
        ],
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.privatePost.getPosts')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ authors: authorDid })
        .expect(200);

      expect(response.body.encryptedPosts).toHaveLength(1);
      expect(response.body.encryptedPosts[0].authorDid).toBe(authorDid);
    });

    it('should support pagination with cursor', async () => {
      // Create multiple posts
      const session = await prisma.privateSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              encryptedSessionKey: 'key',
            },
          },
        },
      });

      for (let i = 0; i < 3; i++) {
        await prisma.encryptedPost.create({
          data: {
            uri: `at://${authorDid}/social.spkeasy.privatePost/post-${i}`,
            authorDid,
            sessionId: session.id,
            encryptedContent: `content-${i}`,
            createdAt: new Date(Date.now() - i * 1000), // Different timestamps
          },
        });
      }

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.privatePost.getPosts')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ limit: '2' })
        .expect(200);

      expect(response.body.encryptedPosts).toHaveLength(2);
      expect(response.body).toHaveProperty('cursor');
    });

    it('should require authentication', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.privatePost.getPosts')
        .expect(401);
    });
  });

  describe('GET /xrpc/social.spkeasy.privatePost.getPostThread', () => {
    it('should retrieve post thread with replies', async () => {
      const parentUri = `at://${authorDid}/social.spkeasy.privatePost/parent`;
      const replyUri = `at://${authorDid}/social.spkeasy.privatePost/reply`;

      const session = await prisma.privateSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              encryptedSessionKey: 'key',
            },
          },
        },
      });

      // Create parent post
      await prisma.encryptedPost.create({
        data: {
          uri: parentUri,
          authorDid,
          sessionId: session.id,
          encryptedContent: 'parent-content',
          createdAt: new Date(),
        },
      });

      // Create reply post
      await prisma.encryptedPost.create({
        data: {
          uri: replyUri,
          authorDid,
          sessionId: session.id,
          encryptedContent: 'reply-content',
          replyTo: parentUri,
          createdAt: new Date(),
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.privatePost.getPostThread')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ uri: parentUri })
        .expect(200);

      expect(response.body).toHaveProperty('encryptedPost');
      expect(response.body).toHaveProperty('encryptedReplyPosts');
      expect(response.body).toHaveProperty('encryptedSessionKeys');
      expect(response.body.encryptedPost.uri).toBe(parentUri);
      expect(response.body.encryptedReplyPosts).toHaveLength(1);
      expect(response.body.encryptedReplyPosts[0].uri).toBe(replyUri);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.privatePost.getPostThread')
        .query({ uri: testPostUri })
        .expect(401);
    });

    it('should require uri parameter', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.privatePost.getPostThread')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400);
    });
  });

  describe('POST /xrpc/social.spkeasy.privatePost.deletePost', () => {
    it('should delete an existing post', async () => {
      const session = await prisma.privateSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid,
              encryptedSessionKey: 'key',
            },
          },
        },
      });

      await prisma.encryptedPost.create({
        data: {
          uri: testPostUri,
          authorDid,
          sessionId: session.id,
          encryptedContent: 'content-to-delete',
          createdAt: new Date(),
        },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.privatePost.deletePost')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ uri: testPostUri })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify post was deleted
      const deletedPost = await prisma.encryptedPost.findUnique({
        where: { uri: testPostUri },
      });
      
      expect(deletedPost).toBeNull();
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.privatePost.deletePost')
        .set('Content-Type', 'application/json')
        .send({ uri: testPostUri })
        .expect(401);
    });

    it('should require uri parameter', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.privatePost.deletePost')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(400);
    });
  });

  describe('POST /xrpc/social.spkeasy.privatePost.preAuth', () => {
    it('should return success for pre-auth endpoint', async () => {
      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.privatePost.preAuth')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.privatePost.preAuth')
        .set('Content-Type', 'application/json')
        .send({})
        .expect(401);
    });
  });
});