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
const anotherUserDid = 'did:example:bob-user';

describe('Service Admin API Tests', () => {
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
    // @ts-ignore - shutdown is private but we need it for tests
    await server.shutdown();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await prisma.inviteCodeUse.deleteMany();
    await prisma.userFeature.deleteMany();
    await prisma.inviteCode.deleteMany();
    
    // Setup mock for Bluesky session validation - use localhost in test mode
    mockBlueskySession({ did: authorDid, host: 'http://localhost:2583' });
  });

  afterEach(() => {
    // Cleanup and verify mocks
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  describe('getFeatures endpoint', () => {
    it('should get features for user with no features', async () => {
      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getFeatures')
        .query({ did: authorDid })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual({
        features: [],
      });
    });

    it('should get features for user with existing features', async () => {
      // Create a test feature for the user
      await prisma.userFeature.create({
        data: {
          userDid: authorDid,
          key: 'private-posts',
          value: 'true',
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getFeatures')
        .query({ did: authorDid })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual({
        features: [
          {
            did: authorDid,
            key: 'private-posts',
            value: 'true',
          },
        ],
      });
    });
  });

  describe('applyInviteCode endpoint', () => {
    it('should apply valid invite code', async () => {
      // Create a test invite code
      const inviteCode = await prisma.inviteCode.create({
        data: {
          code: 'TEST-CODE-123',
          key: 'private-posts',
          value: 'true',
          remainingUses: 5,
        },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.applyInviteCode')
        .send({ code: 'TEST-CODE-123' })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual({
        status: 'success',
      });

      // Verify the feature was created
      const userFeature = await prisma.userFeature.findFirst({
        where: { userDid: authorDid, key: 'private-posts' },
      });
      expect(userFeature).toBeTruthy();
      expect(userFeature?.value).toBe('true');

      // Verify the invite code use was recorded
      const inviteCodeUse = await prisma.inviteCodeUse.findFirst({
        where: { inviteCodeId: inviteCode.id },
      });
      expect(inviteCodeUse).toBeTruthy();

      // Verify remaining uses decremented
      const updatedInviteCode = await prisma.inviteCode.findUnique({
        where: { id: inviteCode.id },
      });
      expect(updatedInviteCode?.remainingUses).toBe(4);
    });

    it('should reject invalid invite code', async () => {
      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.applyInviteCode')
        .send({ code: 'INVALID-CODE' })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body).toEqual({
        error: 'NotFoundError',
        code: 'NotFound',
        message: 'Invalid invite code',
      });
    });

    it('should reject invite code with no remaining uses', async () => {
      // Create an exhausted invite code
      await prisma.inviteCode.create({
        data: {
          code: 'EXHAUSTED-CODE',
          key: 'private-posts',
          value: 'true',
          remainingUses: 0,
        },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.applyInviteCode')
        .send({ code: 'EXHAUSTED-CODE' })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400);

      expect(response.body).toEqual({
        error: 'ValidationError',
        message: 'Invite code has been fully redeemed',
      });
    });

    it('should reject duplicate feature application', async () => {
      // Create existing feature
      await prisma.userFeature.create({
        data: {
          userDid: authorDid,
          key: 'private-posts',
          value: 'true',
        },
      });

      // Create invite code
      await prisma.inviteCode.create({
        data: {
          code: 'DUPLICATE-CODE',
          key: 'private-posts',
          value: 'true',
          remainingUses: 5,
        },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.applyInviteCode')
        .send({ code: 'DUPLICATE-CODE' })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400);

      expect(response.body).toEqual({
        error: 'ValidationError',
        message: 'You already have this feature',
      });
    });
  });
});