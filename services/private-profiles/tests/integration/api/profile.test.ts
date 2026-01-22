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
  mockTwoUserBlueskySession,
  cleanupBlueskySessionMocks,
  generateTestToken,
} from '@speakeasy-services/test-utils';
import request from 'supertest';

const authorDid = 'did:example:profile-author';
const recipientDid = 'did:example:profile-viewer';
const otherUserDid = 'did:example:other-user';

describe('Private Profile API Tests', () => {
  let prisma: PrismaClient;
  const authorToken = generateTestToken(authorDid);
  const recipientToken = generateTestToken(recipientDid);
  const otherUserToken = generateTestToken(otherUserDid);

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await server.start();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    const originalExit = process.exit;
    process.exit = (() => {}) as any;

    try {
      // @ts-ignore - shutdown is private but we need it for tests
      await server.shutdown();
    } catch (error) {
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

    // Setup mock for Bluesky session validation
    mockBlueskySession({ did: authorDid, host: 'http://localhost:2583' });
  });

  afterEach(() => {
    cleanupBlueskySessionMocks();
  });

  describe('GET /xrpc/social.spkeasy.actor.getProfile', () => {
    it('should require did parameter', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfile')
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(400);
    });

    it('should return 404 when profile not found', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfile')
        .query({ did: 'did:example:nonexistent' })
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(404);
    });

    it('should return 404 when caller has no session key (not trusted)', async () => {
      // Create a session and profile but no session key for the caller
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await prisma.privateProfile.create({
        data: {
          authorDid,
          sessionId: session.id,
          encryptedContent: Buffer.from('encrypted-profile-data'),
        },
      });

      // Caller (authorDid) has no session key, so should get 404
      await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfile')
        .query({ did: authorDid })
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(404);
    });

    it('should return profile with session key when trusted', async () => {
      // Create session with session key for the caller
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: authorDid,
              encryptedDek: Buffer.from('encrypted-dek'),
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
            },
          },
        },
      });

      await prisma.privateProfile.create({
        data: {
          authorDid,
          sessionId: session.id,
          encryptedContent: Buffer.from('encrypted-profile-data'),
          avatarUri: 'https://example.com/avatar.jpg',
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfile')
        .query({ did: authorDid })
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('profile');
      expect(response.body).toHaveProperty('encryptedSessionKey');
      expect(response.body.profile.authorDid).toBe(authorDid);
      expect(response.body.profile.avatarUri).toBe(
        'https://example.com/avatar.jpg',
      );
      expect(response.body.encryptedSessionKey.recipientDid).toBe(authorDid);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfile')
        .query({ did: authorDid })
        .expect(401);
    });
  });

  describe('GET /xrpc/social.spkeasy.actor.getProfiles', () => {
    it('should require dids parameter', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfiles')
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(400);
    });

    it('should return empty arrays when no profiles found', async () => {
      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfiles')
        .query({ dids: ['did:example:nonexistent'] })
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);

      expect(response.body.profiles).toEqual([]);
      expect(response.body.encryptedSessionKeys).toEqual([]);
    });

    it('should only return profiles where caller has session key', async () => {
      // Setup multi-user mock
      mockTwoUserBlueskySession({
        validToken: recipientToken,
        validUser: { did: recipientDid, handle: 'viewer.test' },
        wrongUserToken: otherUserToken,
        wrongUser: { did: otherUserDid, handle: 'other.test' },
      });

      // Create session 1 with key for recipient
      const session1 = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid,
              encryptedDek: Buffer.from('dek-1'),
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
            },
          },
        },
      });

      await prisma.privateProfile.create({
        data: {
          authorDid,
          sessionId: session1.id,
          encryptedContent: Buffer.from('profile-1'),
        },
      });

      // Create session 2 with key for otherUser (not recipient)
      const session2 = await prisma.profileSession.create({
        data: {
          authorDid: otherUserDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: otherUserDid, // Only otherUser has access
              encryptedDek: Buffer.from('dek-2'),
              userKeyPairId: '00000000-0000-0000-0000-000000000002',
            },
          },
        },
      });

      await prisma.privateProfile.create({
        data: {
          authorDid: otherUserDid,
          sessionId: session2.id,
          encryptedContent: Buffer.from('profile-2'),
        },
      });

      // Recipient should only see profile 1 (has session key)
      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfiles')
        .query({ dids: [authorDid, otherUserDid] })
        .set('Authorization', `Bearer ${recipientToken}`)
        .expect(200);

      expect(response.body.profiles).toHaveLength(1);
      expect(response.body.profiles[0].authorDid).toBe(authorDid);
      expect(response.body.encryptedSessionKeys).toHaveLength(1);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfiles')
        .query({ dids: [authorDid] })
        .expect(401);
    });
  });

  describe('POST /xrpc/social.spkeasy.actor.putProfile', () => {
    it('should create a new profile', async () => {
      // First create a session for the profile
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const profileData = {
        sessionId: session.id,
        encryptedContent: 'base64-encrypted-content',
        avatarUri: 'https://example.com/avatar.jpg',
        bannerUri: 'https://example.com/banner.jpg',
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.putProfile')
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Content-Type', 'application/json')
        .send(profileData)
        .expect(200);

      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile.authorDid).toBe(authorDid);
      expect(response.body.profile.avatarUri).toBe(
        'https://example.com/avatar.jpg',
      );
    });

    it('should update existing profile', async () => {
      // Create session and initial profile
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await prisma.privateProfile.create({
        data: {
          authorDid,
          sessionId: session.id,
          encryptedContent: Buffer.from('old-content'),
          avatarUri: 'https://example.com/old-avatar.jpg',
        },
      });

      const updateData = {
        sessionId: session.id,
        encryptedContent: 'new-encrypted-content',
        avatarUri: 'https://example.com/new-avatar.jpg',
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.putProfile')
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Content-Type', 'application/json')
        .send(updateData)
        .expect(200);

      expect(response.body.profile.avatarUri).toBe(
        'https://example.com/new-avatar.jpg',
      );
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.actor.putProfile')
        .set('Content-Type', 'application/json')
        .send({
          sessionId: 'test',
          encryptedContent: 'test',
        })
        .expect(401);
    });

    it('should validate required fields', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.actor.putProfile')
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(400);
    });
  });

  describe('POST /xrpc/social.spkeasy.actor.deleteProfile', () => {
    it('should delete existing profile', async () => {
      // Create session and profile
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await prisma.privateProfile.create({
        data: {
          authorDid,
          sessionId: session.id,
          encryptedContent: Buffer.from('to-be-deleted'),
        },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.deleteProfile')
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify profile was deleted
      const profile = await prisma.privateProfile.findFirst({
        where: { authorDid },
      });
      expect(profile).toBeNull();
    });

    it('should return 404 when no profile exists', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.actor.deleteProfile')
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.actor.deleteProfile')
        .expect(401);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      await request(server.express).get('/health').expect(200);
    });
  });
});
