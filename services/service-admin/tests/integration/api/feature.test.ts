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

  describe('generateInviteCode endpoint', () => {
    it('should generate invite code for user with private-posts feature', async () => {
      // Create the private-posts feature for the user
      await prisma.userFeature.create({
        data: {
          userDid: authorDid,
          key: 'private-posts',
          value: 'true',
        },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.generateInviteCode')
        .send({})
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('remainingUses', 6);
      // Check code format: XXXX-XXXX-XXXX
      expect(response.body.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

      // Verify the invite code was created in the database
      const inviteCode = await prisma.inviteCode.findUnique({
        where: { code: response.body.code },
      });
      expect(inviteCode).toBeTruthy();
      expect(inviteCode?.creatorDid).toBe(authorDid);
      expect(inviteCode?.totalUses).toBe(6);
      expect(inviteCode?.remainingUses).toBe(6);
      expect(inviteCode?.key).toBe('private-posts');
    });

    it('should reject user without private-posts feature', async () => {
      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.generateInviteCode')
        .send({})
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400);

      expect(response.body).toEqual({
        error: 'ValidationError',
        message: 'You must have the private-posts feature enabled to generate invite codes',
        code: 'FeatureNotGranted',
      });
    });

    it('should reject user who created invite within last week', async () => {
      // Create the private-posts feature for the user
      await prisma.userFeature.create({
        data: {
          userDid: authorDid,
          key: 'private-posts',
          value: 'true',
        },
      });

      // Create a recent invite code
      await prisma.inviteCode.create({
        data: {
          code: 'RECENT-INVITE-CODE',
          creatorDid: authorDid,
          key: 'private-posts',
          value: 'true',
          totalUses: 6,
          remainingUses: 6,
          createdAt: new Date(), // Created now
        },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.generateInviteCode')
        .send({})
        .set('Authorization', `Bearer ${validToken}`)
        .expect(429);

      expect(response.body).toEqual({
        error: 'RateLimitError',
        message: 'You can only generate one invite code per week',
        details: {},
      });
    });

    it('should allow user who created invite 8+ days ago', async () => {
      // Create the private-posts feature for the user
      await prisma.userFeature.create({
        data: {
          userDid: authorDid,
          key: 'private-posts',
          value: 'true',
        },
      });

      // Create an old invite code (8 days ago)
      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
      await prisma.inviteCode.create({
        data: {
          code: 'OLD-INVITE-CODE',
          creatorDid: authorDid,
          key: 'private-posts',
          value: 'true',
          totalUses: 6,
          remainingUses: 6,
          createdAt: eightDaysAgo,
        },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.generateInviteCode')
        .send({})
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('remainingUses', 6);
    });

    it('should require authentication', async () => {
      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.generateInviteCode')
        .send({})
        .expect(401);

      expect(response.body.error).toBe('AuthenticationError');
    });
  });

  describe('listInviteCodes endpoint', () => {
    it('should return empty list when user has no invite codes', async () => {
      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.listInviteCodes')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual({
        inviteCodes: [],
      });
    });

    it('should return invite codes created by the user', async () => {
      // Create invite codes for the user
      const createdAt1 = new Date('2026-01-15T10:00:00Z');
      const createdAt2 = new Date('2026-01-20T10:00:00Z');

      await prisma.inviteCode.create({
        data: {
          code: 'ABCD-EFGH-JKLM',
          creatorDid: authorDid,
          key: 'private-posts',
          value: 'true',
          totalUses: 6,
          remainingUses: 4,
          createdAt: createdAt1,
        },
      });

      await prisma.inviteCode.create({
        data: {
          code: 'NOPQ-RSTU-VWXY',
          creatorDid: authorDid,
          key: 'private-posts',
          value: 'true',
          totalUses: 6,
          remainingUses: 6,
          createdAt: createdAt2,
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.listInviteCodes')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.inviteCodes).toHaveLength(2);
      // Should be ordered by createdAt desc (newest first)
      expect(response.body.inviteCodes[0]).toEqual({
        code: 'NOPQ-RSTU-VWXY',
        remainingUses: 6,
        totalUses: 6,
        createdAt: createdAt2.toISOString(),
      });
      expect(response.body.inviteCodes[1]).toEqual({
        code: 'ABCD-EFGH-JKLM',
        remainingUses: 4,
        totalUses: 6,
        createdAt: createdAt1.toISOString(),
      });
    });

    it('should not return invite codes created by other users', async () => {
      // Create invite code for another user
      await prisma.inviteCode.create({
        data: {
          code: 'OTHER-USER-CODE',
          creatorDid: anotherUserDid,
          key: 'private-posts',
          value: 'true',
          totalUses: 6,
          remainingUses: 6,
        },
      });

      // Create invite code for the authenticated user
      await prisma.inviteCode.create({
        data: {
          code: 'MY-USER-CODE',
          creatorDid: authorDid,
          key: 'private-posts',
          value: 'true',
          totalUses: 6,
          remainingUses: 5,
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.listInviteCodes')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.inviteCodes).toHaveLength(1);
      expect(response.body.inviteCodes[0].code).toBe('MY-USER-CODE');
    });

    it('should require authentication', async () => {
      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.listInviteCodes')
        .expect(401);

      expect(response.body.error).toBe('AuthenticationError');
    });
  });
});