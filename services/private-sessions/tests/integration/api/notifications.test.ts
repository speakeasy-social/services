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

const userDid = 'did:example:user';
const otherUserDid = 'did:example:other-user';

describe('Notifications API Tests', () => {
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
    // Clear test data before each test - order matters due to foreign key constraints
    await prisma.reaction.deleteMany();
    await prisma.mediaPost.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.seenNotifications.deleteMany();
    await prisma.encryptedPost.deleteMany();
    await prisma.sessionKey.deleteMany();
    await prisma.session.deleteMany();

    // Setup mock for Bluesky session validation
    mockBlueskySession({ did: userDid, host: 'http://localhost:2583' });
  });

  afterEach(() => {
    // Cleanup and verify mocks
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  describe('GET /xrpc/social.spkeasy.notification.getUnreadCount', () => {
    it('should return unread notification count', async () => {
      // Create some notifications for the user
      await Promise.all([
        prisma.notification.create({
          data: {
            id: '00000000-0000-0000-0000-000000000001',
            userDid,
            reason: 'POST',
            authorDid: otherUserDid,
            reasonSubject: `at://${otherUserDid}/social.spkeasy.privatePost/post1`,
            readAt: null, // Unread
            updatedAt: new Date(),
          },
        }),
        prisma.notification.create({
          data: {
            id: '00000000-0000-0000-0000-000000000002',
            userDid,
            reason: 'REACTION',
            authorDid: otherUserDid,
            reasonSubject: `at://${userDid}/social.spkeasy.privatePost/post2`,
            readAt: null, // Unread
            updatedAt: new Date(),
          },
        }),
        prisma.notification.create({
          data: {
            id: '00000000-0000-0000-0000-000000000003',
            userDid,
            reason: 'POST',
            authorDid: otherUserDid,
            reasonSubject: `at://${otherUserDid}/social.spkeasy.privatePost/post3`,
            readAt: new Date(), // Read
            updatedAt: new Date(),
          },
        }),
      ]);

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.notification.getUnreadCount')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('count', 2);
    });

    it('should return zero for user with no notifications', async () => {
      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.notification.getUnreadCount')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('count', 0);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.notification.getUnreadCount')
        .expect(401);
    });
  });

  describe('GET /xrpc/social.spkeasy.notification.listNotifications', () => {
    it('should list notifications for user', async () => {
      // Create notifications for the user
      const notifications = await Promise.all([
        prisma.notification.create({
          data: {
            id: '00000000-0000-0000-0000-000000000004',
            userDid,
            reason: 'POST',
            authorDid: otherUserDid,
            reasonSubject: `at://${otherUserDid}/social.spkeasy.privatePost/post1`,
            createdAt: new Date(Date.now() - 1000),
            updatedAt: new Date(),
          },
        }),
        prisma.notification.create({
          data: {
            id: '00000000-0000-0000-0000-000000000005',
            userDid,
            reason: 'REACTION',
            authorDid: otherUserDid,
            reasonSubject: `at://${userDid}/social.spkeasy.privatePost/post2`,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }),
      ]);

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.notification.listNotifications')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('notifications');
      expect(response.body.notifications).toHaveLength(2);
      expect(response.body.notifications[0]).toHaveProperty('reason');
      expect(response.body.notifications[0]).toHaveProperty('authorDid');
      expect(response.body.notifications[0]).toHaveProperty('reasonSubject');
    });

    it('should support pagination with limit and cursor', async () => {
      // Create multiple notifications
      for (let i = 0; i < 5; i++) {
        await prisma.notification.create({
          data: {
            id: `00000000-0000-0000-0000-00000000000${(i + 6).toString(16)}`,
            userDid,
            reason: 'POST',
            authorDid: otherUserDid,
            reasonSubject: `at://${otherUserDid}/social.spkeasy.privatePost/post${i}`,
            createdAt: new Date(Date.now() - i * 1000),
            updatedAt: new Date(),
          },
        });
      }

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.notification.listNotifications')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ limit: '3' })
        .expect(200);

      expect(response.body.notifications).toHaveLength(3);
      expect(response.body).toHaveProperty('cursor');
    });

    it('should require authentication', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.notification.listNotifications')
        .expect(401);
    });

    it('should not return notifications for other users', async () => {
      // Create notification for another user
      await prisma.notification.create({
        data: {
          id: '00000000-0000-0000-0000-00000000000d',
          userDid: otherUserDid, // Different user
          reason: 'POST',
          authorDid: userDid,
          reasonSubject: `at://${userDid}/social.spkeasy.privatePost/post1`,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.notification.listNotifications')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.notifications).toHaveLength(0);
    });
  });

  describe('POST /xrpc/social.spkeasy.notification.updateSeen', () => {
    it('should mark notifications as seen', async () => {
      // Create unread notifications
      const notification1 = await prisma.notification.create({
        data: {
          id: '00000000-0000-0000-0000-00000000000e',
          userDid,
          reason: 'POST',
          authorDid: otherUserDid,
          reasonSubject: `at://${otherUserDid}/social.spkeasy.privatePost/post1`,
          createdAt: new Date(Date.now() - 2000),
          readAt: null,
          updatedAt: new Date(),
        },
      });

      const notification2 = await prisma.notification.create({
        data: {
          id: '00000000-0000-0000-0000-00000000000f',
          userDid,
          reason: 'REACTION',
          authorDid: otherUserDid,
          reasonSubject: `at://${userDid}/social.spkeasy.privatePost/post2`,
          createdAt: new Date(Date.now() - 1000),
          readAt: null,
          updatedAt: new Date(),
        },
      });

      const seenAt = new Date().toISOString();

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.notification.updateSeen')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ seenAt })
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');

      // Verify notifications were marked as read (readAt field updated)
      const updatedNotifications = await prisma.notification.findMany({
        where: {
          userDid,
          id: { in: [notification1.id, notification2.id] },
        },
      });

      expect(updatedNotifications).toHaveLength(2);
      updatedNotifications.forEach((notification) => {
        expect(notification.readAt).not.toBeNull();
      });
    });

    it('should only update notifications created before seenAt timestamp', async () => {
      const baseTime = new Date();
      const seenTime = new Date(baseTime.getTime() + 1000); // 1 second after base

      // Create notification before seenAt
      const oldNotification = await prisma.notification.create({
        data: {
          id: '00000000-0000-0000-0000-000000000010',
          userDid,
          reason: 'POST',
          authorDid: otherUserDid,
          reasonSubject: `at://${otherUserDid}/social.spkeasy.privatePost/post1`,
          createdAt: baseTime,
          readAt: null,
          updatedAt: new Date(),
        },
      });

      // Create notification after seenAt
      const newNotification = await prisma.notification.create({
        data: {
          id: '00000000-0000-0000-0000-000000000011',
          userDid,
          reason: 'POST',
          authorDid: otherUserDid,
          reasonSubject: `at://${otherUserDid}/social.spkeasy.privatePost/post2`,
          createdAt: new Date(baseTime.getTime() + 2000), // 2 seconds after base
          readAt: null,
          updatedAt: new Date(),
        },
      });

      await request(server.express)
        .post('/xrpc/social.spkeasy.notification.updateSeen')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ seenAt: seenTime.toISOString() })
        .expect(200);

      // Check that only old notification was marked as read
      const updatedOldNotification = await prisma.notification.findUnique({
        where: { id: oldNotification.id },
      });
      const updatedNewNotification = await prisma.notification.findUnique({
        where: { id: newNotification.id },
      });

      expect(updatedOldNotification?.readAt).not.toBeNull(); // Should be marked as read
      expect(updatedNewNotification?.readAt).toBeNull(); // Should still be unread
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.notification.updateSeen')
        .set('Content-Type', 'application/json')
        .send({ seenAt: new Date().toISOString() })
        .expect(401);
    });

    it('should require seenAt parameter', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.notification.updateSeen')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(400);
    });
  });
});
