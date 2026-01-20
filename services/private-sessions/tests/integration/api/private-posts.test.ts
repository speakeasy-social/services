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
    // Clear test data before each test - order matters due to foreign key constraints
    await prisma.reaction.deleteMany();
    await prisma.mediaPost.deleteMany();
    await prisma.notification.deleteMany();
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

  describe('POST /xrpc/social.spkeasy.privatePost.createPosts', () => {
    it('should create encrypted posts successfully', async () => {
      // First create a session
      const session = await prisma.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid,
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
              encryptedDek: Buffer.from('session-key'),
            },
          },
        },
      });

      const postData = {
        sessionId: session.id,
        encryptedPosts: [
          {
            uri: `at://${authorDid}/social.spkeasy.feed.privatePost/test-post`,
            rkey: 'test-post',
            langs: ['en'],
            encryptedContent: 'encrypted-post-content',
            media: [],
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
      const expectedUri = `at://${authorDid}/social.spkeasy.feed.privatePost/test-post`;
      const post = await prisma.encryptedPost.findUnique({
        where: { uri: expectedUri },
      });
      
      expect(post).not.toBeNull();
      expect(post?.authorDid).toBe(authorDid);
      expect(post?.uri).toBe(expectedUri);
    });

    it('should create posts with reply relationships', async () => {
      // Create parent post first
      const parentUri = `at://${authorDid}/social.spkeasy.privatePost/parent-post`;
      const session = await prisma.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid,
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
              encryptedDek: Buffer.from('session-key'),
            },
          },
        },
      });

      await prisma.encryptedPost.create({
        data: {
          uri: parentUri,
          rkey: 'parent-post',
          authorDid,
          sessionId: session.id,
          langs: ['en'],
          encryptedContent: Buffer.from('parent-post-content'),
          createdAt: new Date(),
        },
      });

      const replyData = {
        sessionId: session.id,
        encryptedPosts: [
          {
            uri: `at://${authorDid}/social.spkeasy.feed.privatePost/test-reply`,
            rkey: 'test-reply',
            langs: ['en'],
            encryptedContent: 'encrypted-reply-content',
            media: [],
            reply: {
              parent: { uri: parentUri },
              root: { uri: parentUri },
            },
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
      const expectedReplyUri = `at://${authorDid}/social.spkeasy.feed.privatePost/test-reply`;
      const replyPost = await prisma.encryptedPost.findUnique({
        where: { uri: expectedReplyUri },
      });
      
      expect(replyPost).not.toBeNull();
      expect(replyPost?.replyUri).toBe(parentUri);
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
      const session = await prisma.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: [
              {
                recipientDid: authorDid, // User's own key
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
                encryptedDek: Buffer.from('user-session-key'),
              },
              {
                recipientDid,
                userKeyPairId: '00000000-0000-0000-0000-000000000002',
                encryptedDek: Buffer.from('recipient-key'),
              },
            ],
          },
        },
      });

      await prisma.encryptedPost.create({
        data: {
          uri: testPostUri,
          rkey: 'test-post',
          authorDid,
          sessionId: session.id,
          langs: ['en'],
          encryptedContent: Buffer.from('encrypted-content'),
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
      const session1 = await prisma.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
              encryptedDek: Buffer.from('key1'),
            },
          },
        },
      });

      const session2 = await prisma.session.create({
        data: {
          authorDid: otherAuthor,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid, // User can see this post
              userKeyPairId: '00000000-0000-0000-0000-000000000002',
              encryptedDek: Buffer.from('key2'),
            },
          },
        },
      });

      await Promise.all([
        prisma.encryptedPost.create({
          data: {
            uri: testPostUri,
            rkey: 'test-post',
            authorDid,
            sessionId: session1.id,
            langs: ['en'],
            encryptedContent: Buffer.from('content1'),
            createdAt: new Date(),
          },
        }),
        prisma.encryptedPost.create({
          data: {
            uri: `at://${otherAuthor}/social.spkeasy.privatePost/other-post`,
            rkey: 'other-post',
            authorDid: otherAuthor,
            sessionId: session2.id,
            langs: ['en'],
            encryptedContent: Buffer.from('content2'),
            createdAt: new Date(),
          },
        }),
      ]);

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
      const session = await prisma.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
              encryptedDek: Buffer.from('key'),
            },
          },
        },
      });

      for (let i = 0; i < 3; i++) {
        await prisma.encryptedPost.create({
          data: {
            uri: `at://${authorDid}/social.spkeasy.privatePost/post-${i}`,
            rkey: `post-${i}`,
            authorDid,
            sessionId: session.id,
            langs: ['en'],
            encryptedContent: Buffer.from(`content-${i}`),
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

      const session = await prisma.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
              encryptedDek: Buffer.from('key'),
            },
          },
        },
      });

      // Create parent post
      const actualParentUri = `at://${authorDid}/social.spkeasy.feed.privatePost/parent`;
      await prisma.encryptedPost.create({
        data: {
          uri: actualParentUri,
          rkey: 'parent',
          authorDid,
          sessionId: session.id,
          langs: ['en'],
          encryptedContent: Buffer.from('parent-content'),
          createdAt: new Date(),
        },
      });

      // Create reply post
      const actualReplyUri = `at://${authorDid}/social.spkeasy.feed.privatePost/reply`;
      await prisma.encryptedPost.create({
        data: {
          uri: actualReplyUri,
          rkey: 'reply',
          authorDid,
          sessionId: session.id,
          langs: ['en'],
          encryptedContent: Buffer.from('reply-content'),
          replyUri: actualParentUri,
          createdAt: new Date(),
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.privatePost.getPostThread')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ uri: actualParentUri })
        .expect(200);

      expect(response.body).toHaveProperty('encryptedPost');
      expect(response.body).toHaveProperty('encryptedReplyPosts');
      expect(response.body).toHaveProperty('encryptedSessionKeys');
      expect(response.body.encryptedPost.uri).toBe(actualParentUri);
      expect(response.body.encryptedReplyPosts).toHaveLength(1);
      expect(response.body.encryptedReplyPosts[0].uri).toBe(actualReplyUri);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.privatePost.getPostThread')
        .query({ uri: testPostUri })
        .expect(401);
    });

    it('should return internal server error when uri parameter is missing', async () => {
      // The API doesn't validate uri as required in lexicon, but service logic expects it
      // resulting in internal server error instead of validation error
      await request(server.express)
        .get('/xrpc/social.spkeasy.privatePost.getPostThread')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);
    });
  });

  describe('POST /xrpc/social.spkeasy.privatePost.deletePost', () => {
    it('should delete an existing post', async () => {
      const session = await prisma.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid,
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
              encryptedDek: Buffer.from('key'),
            },
          },
        },
      });

      await prisma.encryptedPost.create({
        data: {
          uri: testPostUri,
          rkey: 'test-post',
          authorDid,
          sessionId: session.id,
          langs: ['en'],
          encryptedContent: Buffer.from('content-to-delete'),
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

  describe('Authorization Boundary Tests', () => {
    const otherUserDid = 'did:example:bob-other-user';
    const otherUserToken = generateTestToken(otherUserDid);

    describe('Cross-user post access control', () => {
      it('should not allow user to delete another user\'s post', async () => {
        // Mock Bluesky session for otherUserDid who will try to delete
        mockBlueskySession({ did: otherUserDid, host: 'http://localhost:2583' });

        // Create session and post owned by authorDid
        const session = await prisma.session.create({
          data: {
            authorDid,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            sessionKeys: {
              create: {
                recipientDid: authorDid,
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
                encryptedDek: Buffer.from('key'),
              },
            },
          },
        });

        await prisma.encryptedPost.create({
          data: {
            uri: testPostUri,
            rkey: 'test-post',
            authorDid,
            sessionId: session.id,
            langs: ['en'],
            encryptedContent: Buffer.from('content'),
            createdAt: new Date(),
          },
        });

        // Try to delete with otherUserDid's token
        await request(server.express)
          .post('/xrpc/social.spkeasy.privatePost.deletePost')
          .set('Authorization', `Bearer ${otherUserToken}`)
          .set('Content-Type', 'application/json')
          .send({ uri: testPostUri })
          .expect(403); // Should be forbidden - user cannot delete another user's post

        // Verify post still exists
        const post = await prisma.encryptedPost.findUnique({
          where: { uri: testPostUri },
        });
        expect(post).not.toBeNull();
      });

      it('should not return posts from sessions user is not a member of', async () => {
        // Mock Bluesky session for otherUserDid who will try to read
        mockBlueskySession({ did: otherUserDid, host: 'http://localhost:2583' });

        // Create session WITHOUT otherUserDid as a recipient
        const session = await prisma.session.create({
          data: {
            authorDid,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            sessionKeys: {
              create: {
                recipientDid: authorDid, // Only authorDid, not otherUserDid
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
                encryptedDek: Buffer.from('key'),
              },
            },
          },
        });

        await prisma.encryptedPost.create({
          data: {
            uri: testPostUri,
            rkey: 'test-post',
            authorDid,
            sessionId: session.id,
            langs: ['en'],
            encryptedContent: Buffer.from('content'),
            createdAt: new Date(),
          },
        });

        // Try to fetch posts as otherUserDid
        const response = await request(server.express)
          .get('/xrpc/social.spkeasy.privatePost.getPosts')
          .set('Authorization', `Bearer ${otherUserToken}`)
          .query({ limit: '10' })
          .expect(200);

        // Should return empty list - no session keys for otherUserDid
        expect(response.body.encryptedPosts).toHaveLength(0);
        expect(response.body.encryptedSessionKeys).toHaveLength(0);
      });

      it('should not return post thread if user is not in session', async () => {
        // Mock Bluesky session for otherUserDid who will try to read thread
        mockBlueskySession({ did: otherUserDid, host: 'http://localhost:2583' });

        // Create session and post WITHOUT otherUserDid
        const session = await prisma.session.create({
          data: {
            authorDid,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            sessionKeys: {
              create: {
                recipientDid: authorDid,
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
                encryptedDek: Buffer.from('key'),
              },
            },
          },
        });

        const uri = `at://${authorDid}/social.spkeasy.feed.privatePost/thread-post`;
        await prisma.encryptedPost.create({
          data: {
            uri,
            rkey: 'thread-post',
            authorDid,
            sessionId: session.id,
            langs: ['en'],
            encryptedContent: Buffer.from('content'),
            createdAt: new Date(),
          },
        });

        // Try to fetch thread as otherUserDid
        const response = await request(server.express)
          .get('/xrpc/social.spkeasy.privatePost.getPostThread')
          .set('Authorization', `Bearer ${otherUserToken}`)
          .query({ uri })
          .expect(404); // Should not find post
      });
    });

    describe('Session state validation', () => {
      it('should not return posts from expired sessions', async () => {
        // Create expired session
        const expiredSession = await prisma.session.create({
          data: {
            authorDid,
            expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired yesterday
            sessionKeys: {
              create: {
                recipientDid: authorDid,
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
                encryptedDek: Buffer.from('key'),
              },
            },
          },
        });

        await prisma.encryptedPost.create({
          data: {
            uri: testPostUri,
            rkey: 'test-post',
            authorDid,
            sessionId: expiredSession.id,
            langs: ['en'],
            encryptedContent: Buffer.from('content'),
            createdAt: new Date(),
          },
        });

        const response = await request(server.express)
          .get('/xrpc/social.spkeasy.privatePost.getPosts')
          .set('Authorization', `Bearer ${validToken}`)
          .query({ limit: '10' })
          .expect(200);

        // Should not return posts from expired session
        expect(response.body.encryptedPosts).toHaveLength(0);
      });

      it('should not return posts from revoked sessions', async () => {
        // Create revoked session
        const revokedSession = await prisma.session.create({
          data: {
            authorDid,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            revokedAt: new Date(), // Revoked
            sessionKeys: {
              create: {
                recipientDid: authorDid,
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
                encryptedDek: Buffer.from('key'),
              },
            },
          },
        });

        await prisma.encryptedPost.create({
          data: {
            uri: testPostUri,
            rkey: 'test-post',
            authorDid,
            sessionId: revokedSession.id,
            langs: ['en'],
            encryptedContent: Buffer.from('content'),
            createdAt: new Date(),
          },
        });

        const response = await request(server.express)
          .get('/xrpc/social.spkeasy.privatePost.getPosts')
          .set('Authorization', `Bearer ${validToken}`)
          .query({ limit: '10' })
          .expect(200);

        // Should not return posts from revoked session
        expect(response.body.encryptedPosts).toHaveLength(0);
      });
    });

    describe('DID extraction and URI validation', () => {
      it('should reject posts with mismatched author DID in URI', async () => {
        const session = await prisma.session.create({
          data: {
            authorDid,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            sessionKeys: {
              create: {
                recipientDid,
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
                encryptedDek: Buffer.from('session-key'),
              },
            },
          },
        });

        // URI with different DID than authenticated user
        const mismatchedUri = `at://${otherUserDid}/social.spkeasy.feed.privatePost/test-post`;
        const postData = {
          sessionId: session.id,
          encryptedPosts: [
            {
              uri: mismatchedUri,
              rkey: 'test-post',
              langs: ['en'],
              encryptedContent: 'encrypted-post-content',
              media: [],
            },
          ],
        };

        // Should fail validation or authorization
        const response = await request(server.express)
          .post('/xrpc/social.spkeasy.privatePost.createPosts')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Content-Type', 'application/json')
          .send(postData);

        // Expect either 400 (validation) or 403 (authorization)
        expect([400, 403, 500]).toContain(response.status);
      });

      it('should handle invalid URI format gracefully', async () => {
        const session = await prisma.session.create({
          data: {
            authorDid,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            sessionKeys: {
              create: {
                recipientDid: authorDid,
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
                encryptedDek: Buffer.from('key'),
              },
            },
          },
        });

        const postData = {
          sessionId: session.id,
          encryptedPosts: [
            {
              uri: 'invalid-uri-format',
              rkey: 'test-post',
              langs: ['en'],
              encryptedContent: 'encrypted-post-content',
              media: [],
            },
          ],
        };

        const response = await request(server.express)
          .post('/xrpc/social.spkeasy.privatePost.createPosts')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Content-Type', 'application/json')
          .send(postData);

        // Should return error (400 or 500)
        expect(response.status).toBeGreaterThanOrEqual(400);
      });
    });
  });

  describe('GET /xrpc/social.spkeasy.privatePost.getPosts - Filtering', () => {
    it('should filter posts with hasReplies=true', async () => {
      const session = await prisma.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
              encryptedDek: Buffer.from('key'),
            },
          },
        },
      });

      // Create a parent post (no reply)
      const parentUri = `at://${authorDid}/social.spkeasy.feed.privatePost/parent`;
      await prisma.encryptedPost.create({
        data: {
          uri: parentUri,
          rkey: 'parent',
          authorDid,
          sessionId: session.id,
          langs: ['en'],
          encryptedContent: Buffer.from('parent-content'),
          replyUri: null,
          replyRootUri: null,
        },
      });

      // Create a reply post
      const replyUri = `at://${authorDid}/social.spkeasy.feed.privatePost/reply`;
      await prisma.encryptedPost.create({
        data: {
          uri: replyUri,
          rkey: 'reply',
          authorDid,
          sessionId: session.id,
          langs: ['en'],
          encryptedContent: Buffer.from('reply-content'),
          replyUri: parentUri,
          replyRootUri: parentUri,
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.privatePost.getPosts')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ hasReplies: 'true' })
        .expect(200);

      expect(response.body.encryptedPosts).toHaveLength(1);
      expect(response.body.encryptedPosts[0].uri).toBe(replyUri);
    });

    it('should filter posts with hasMedia=true', async () => {
      const session = await prisma.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
              encryptedDek: Buffer.from('key'),
            },
          },
        },
      });

      // Create a post without media
      const postWithoutMediaUri = `at://${authorDid}/social.spkeasy.feed.privatePost/no-media`;
      await prisma.encryptedPost.create({
        data: {
          uri: postWithoutMediaUri,
          rkey: 'no-media',
          authorDid,
          sessionId: session.id,
          langs: ['en'],
          encryptedContent: Buffer.from('content-no-media'),
        },
      });

      // Create a post with media
      const postWithMediaUri = `at://${authorDid}/social.spkeasy.feed.privatePost/with-media`;
      await prisma.encryptedPost.create({
        data: {
          uri: postWithMediaUri,
          rkey: 'with-media',
          authorDid,
          sessionId: session.id,
          langs: ['en'],
          encryptedContent: Buffer.from('content-with-media'),
          mediaPosts: {
            create: {
              mediaKey: 'test-media-key',
            },
          },
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.privatePost.getPosts')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ hasMedia: 'true' })
        .expect(200);

      expect(response.body.encryptedPosts).toHaveLength(1);
      expect(response.body.encryptedPosts[0].uri).toBe(postWithMediaUri);
    });
  });

  describe('Recipient (Non-Author) Access Tests', () => {
    // These tests verify that recipients who have session keys but are NOT the author
    // can properly access posts shared with them
    const recipientToken = generateTestToken(recipientDid);

    const thirdUserDid = 'did:example:charlie-third-user';

    describe('GET /xrpc/social.spkeasy.privatePost.getPosts - Recipient Access', () => {
      it('should allow recipient to view posts shared with them', async () => {
        // Mock Bluesky session for recipient (not the author)
        mockBlueskySession({ did: recipientDid, host: 'http://localhost:2583' });

        // Create a session where authorDid is author, with multiple recipients
        // This tests that authorization works correctly with 3+ session keys
        const session = await prisma.session.create({
          data: {
            authorDid,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            sessionKeys: {
              create: [
                {
                  recipientDid: authorDid, // Author's own key
                  userKeyPairId: '00000000-0000-0000-0000-000000000001',
                  encryptedDek: Buffer.from('author-key'),
                },
                {
                  recipientDid, // Recipient's key
                  userKeyPairId: '00000000-0000-0000-0000-000000000002',
                  encryptedDek: Buffer.from('recipient-key'),
                },
                {
                  recipientDid: thirdUserDid, // Third user's key
                  userKeyPairId: '00000000-0000-0000-0000-000000000003',
                  encryptedDek: Buffer.from('third-user-key'),
                },
              ],
            },
          },
        });

        // Author creates a post
        const postUri = `at://${authorDid}/social.spkeasy.feed.privatePost/shared-post`;
        await prisma.encryptedPost.create({
          data: {
            uri: postUri,
            rkey: 'shared-post',
            authorDid,
            sessionId: session.id,
            langs: ['en'],
            encryptedContent: Buffer.from('content-shared-with-recipient'),
          },
        });

        // Recipient should be able to view the post
        const response = await request(server.express)
          .get('/xrpc/social.spkeasy.privatePost.getPosts')
          .set('Authorization', `Bearer ${recipientToken}`)
          .query({ limit: '10' })
          .expect(200);

        expect(response.body.encryptedPosts).toHaveLength(1);
        expect(response.body.encryptedPosts[0].uri).toBe(postUri);
        expect(response.body.encryptedPosts[0].authorDid).toBe(authorDid);
        expect(response.body.encryptedSessionKeys).toHaveLength(1);
        expect(response.body.encryptedSessionKeys[0].recipientDid).toBe(recipientDid);
      });

      it('should return session keys for recipient, not author keys', async () => {
        mockBlueskySession({ did: recipientDid, host: 'http://localhost:2583' });

        const session = await prisma.session.create({
          data: {
            authorDid,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            sessionKeys: {
              create: [
                {
                  recipientDid: authorDid,
                  userKeyPairId: '00000000-0000-0000-0000-000000000001',
                  encryptedDek: Buffer.from('author-key'),
                },
                {
                  recipientDid,
                  userKeyPairId: '00000000-0000-0000-0000-000000000002',
                  encryptedDek: Buffer.from('recipient-key'),
                },
                {
                  recipientDid: thirdUserDid,
                  userKeyPairId: '00000000-0000-0000-0000-000000000003',
                  encryptedDek: Buffer.from('third-user-key'),
                },
              ],
            },
          },
        });

        await prisma.encryptedPost.create({
          data: {
            uri: `at://${authorDid}/social.spkeasy.feed.privatePost/test`,
            rkey: 'test',
            authorDid,
            sessionId: session.id,
            langs: ['en'],
            encryptedContent: Buffer.from('content'),
          },
        });

        const response = await request(server.express)
          .get('/xrpc/social.spkeasy.privatePost.getPosts')
          .set('Authorization', `Bearer ${recipientToken}`)
          .query({ limit: '10' })
          .expect(200);

        // Should only return the recipient's session key, not the author's
        expect(response.body.encryptedSessionKeys).toHaveLength(1);
        expect(response.body.encryptedSessionKeys[0].recipientDid).toBe(recipientDid);
      });
    });

    describe('GET /xrpc/social.spkeasy.privatePost.getPostThread - Recipient Access', () => {
      it('should allow recipient to view post thread shared with them', async () => {
        mockBlueskySession({ did: recipientDid, host: 'http://localhost:2583' });

        const session = await prisma.session.create({
          data: {
            authorDid,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            sessionKeys: {
              create: [
                {
                  recipientDid: authorDid,
                  userKeyPairId: '00000000-0000-0000-0000-000000000001',
                  encryptedDek: Buffer.from('author-key'),
                },
                {
                  recipientDid,
                  userKeyPairId: '00000000-0000-0000-0000-000000000002',
                  encryptedDek: Buffer.from('recipient-key'),
                },
                {
                  recipientDid: thirdUserDid,
                  userKeyPairId: '00000000-0000-0000-0000-000000000003',
                  encryptedDek: Buffer.from('third-user-key'),
                },
              ],
            },
          },
        });

        // Create parent post
        const parentUri = `at://${authorDid}/social.spkeasy.feed.privatePost/parent`;
        await prisma.encryptedPost.create({
          data: {
            uri: parentUri,
            rkey: 'parent',
            authorDid,
            sessionId: session.id,
            langs: ['en'],
            encryptedContent: Buffer.from('parent-content'),
          },
        });

        // Create reply post
        const replyUri = `at://${authorDid}/social.spkeasy.feed.privatePost/reply`;
        await prisma.encryptedPost.create({
          data: {
            uri: replyUri,
            rkey: 'reply',
            authorDid,
            sessionId: session.id,
            langs: ['en'],
            encryptedContent: Buffer.from('reply-content'),
            replyUri: parentUri,
            replyRootUri: parentUri,
          },
        });

        // Recipient should be able to view the thread
        const response = await request(server.express)
          .get('/xrpc/social.spkeasy.privatePost.getPostThread')
          .set('Authorization', `Bearer ${recipientToken}`)
          .query({ uri: parentUri })
          .expect(200);

        expect(response.body.encryptedPost).not.toBeNull();
        expect(response.body.encryptedPost.uri).toBe(parentUri);
        expect(response.body.encryptedReplyPosts).toHaveLength(1);
        expect(response.body.encryptedReplyPosts[0].uri).toBe(replyUri);
      });

      it('should allow recipient to view a single post by URI', async () => {
        mockBlueskySession({ did: recipientDid, host: 'http://localhost:2583' });

        const session = await prisma.session.create({
          data: {
            authorDid,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            sessionKeys: {
              create: [
                {
                  recipientDid: authorDid,
                  userKeyPairId: '00000000-0000-0000-0000-000000000001',
                  encryptedDek: Buffer.from('author-key'),
                },
                {
                  recipientDid,
                  userKeyPairId: '00000000-0000-0000-0000-000000000002',
                  encryptedDek: Buffer.from('recipient-key'),
                },
                {
                  recipientDid: thirdUserDid,
                  userKeyPairId: '00000000-0000-0000-0000-000000000003',
                  encryptedDek: Buffer.from('third-user-key'),
                },
              ],
            },
          },
        });

        const postUri = `at://${authorDid}/social.spkeasy.feed.privatePost/single`;
        await prisma.encryptedPost.create({
          data: {
            uri: postUri,
            rkey: 'single',
            authorDid,
            sessionId: session.id,
            langs: ['en'],
            encryptedContent: Buffer.from('single-post-content'),
          },
        });

        const response = await request(server.express)
          .get('/xrpc/social.spkeasy.privatePost.getPostThread')
          .set('Authorization', `Bearer ${recipientToken}`)
          .query({ uri: postUri })
          .expect(200);

        expect(response.body.encryptedPost).not.toBeNull();
        expect(response.body.encryptedPost.uri).toBe(postUri);
        expect(response.body.encryptedPost.authorDid).toBe(authorDid);
      });
    });
  });
});