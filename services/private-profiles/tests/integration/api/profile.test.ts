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
const otherUserDid = 'did:example:other-user';

describe('Profile API Tests', () => {
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

  describe('POST /xrpc/social.spkeasy.actor.putProfile', () => {
    it('should create a new profile', async () => {
      // First create a session
      const session = await prisma.profileSession.create({
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

      const profileData = {
        sessionId: session.id,
        encryptedContent: 'encrypted-profile-content-base64',
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
      expect(response.body.profile).toHaveProperty('authorDid', authorDid);
      expect(response.body.profile).toHaveProperty('sessionId', session.id);
      expect(response.body.profile).toHaveProperty('avatarUri', 'https://example.com/avatar.jpg');
      expect(response.body.profile).toHaveProperty('bannerUri', 'https://example.com/banner.jpg');
    });

    it('should update an existing profile', async () => {
      // Create session and profile
      const session = await prisma.profileSession.create({
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

      await prisma.privateProfile.create({
        data: {
          sessionId: session.id,
          authorDid,
          encryptedContent: Buffer.from('original-content'),
          avatarUri: 'https://example.com/old-avatar.jpg',
        },
      });

      const updatedProfileData = {
        sessionId: session.id,
        encryptedContent: 'updated-encrypted-content',
        avatarUri: 'https://example.com/new-avatar.jpg',
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.putProfile')
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Content-Type', 'application/json')
        .send(updatedProfileData)
        .expect(200);

      expect(response.body.profile).toHaveProperty('avatarUri', 'https://example.com/new-avatar.jpg');

      // Verify only one profile exists
      const profiles = await prisma.privateProfile.findMany({
        where: { authorDid },
      });
      expect(profiles).toHaveLength(1);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.actor.putProfile')
        .set('Content-Type', 'application/json')
        .send({
          sessionId: '00000000-0000-0000-0000-000000000001',
          encryptedContent: 'test-content',
        })
        .expect(401);
    });

    it('should require sessionId and encryptedContent', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.actor.putProfile')
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(400);
    });
  });

  describe('GET /xrpc/social.spkeasy.actor.getProfile', () => {
    it('should get own profile when caller is author and recipient', async () => {
      // Create session with author as recipient
      const session = await prisma.profileSession.create({
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

      await prisma.privateProfile.create({
        data: {
          sessionId: session.id,
          authorDid,
          encryptedContent: Buffer.from('test-encrypted-content'),
          avatarUri: 'https://example.com/avatar.jpg',
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfile')
        .query({ did: authorDid })
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile).toHaveProperty('authorDid', authorDid);
      expect(response.body).toHaveProperty('encryptedSessionKey');
      expect(response.body.encryptedSessionKey).toHaveProperty('recipientDid', authorDid);
    });

    it('should get profile when caller is a session recipient', async () => {
      // Create session with both author and recipient having access
      const session = await prisma.profileSession.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: [
              {
                recipientDid: authorDid,
                encryptedDek: Buffer.from('author-session-key'),
                userKeyPairId: '00000000-0000-0000-0000-000000000001',
              },
              {
                recipientDid: recipientDid,
                encryptedDek: Buffer.from('recipient-session-key'),
                userKeyPairId: '00000000-0000-0000-0000-000000000002',
              },
            ],
          },
        },
      });

      await prisma.privateProfile.create({
        data: {
          sessionId: session.id,
          authorDid,
          encryptedContent: Buffer.from('test-encrypted-content'),
        },
      });

      // Mock session for recipient
      cleanupBlueskySessionMocks();
      mockBlueskySession({ did: recipientDid, host: 'http://localhost:2583' });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfile')
        .query({ did: authorDid })
        .set('Authorization', `Bearer ${recipientToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile).toHaveProperty('authorDid', authorDid);
      expect(response.body).toHaveProperty('encryptedSessionKey');
      expect(response.body.encryptedSessionKey).toHaveProperty('recipientDid', recipientDid);
    });

    it('should return 404 when caller is not a session recipient', async () => {
      // Create session without otherUser as recipient
      const session = await prisma.profileSession.create({
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

      await prisma.privateProfile.create({
        data: {
          sessionId: session.id,
          authorDid,
          encryptedContent: Buffer.from('test-encrypted-content'),
        },
      });

      // Mock session for other user
      cleanupBlueskySessionMocks();
      mockBlueskySession({ did: otherUserDid, host: 'http://localhost:2583' });

      await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfile')
        .query({ did: authorDid })
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(404);
    });

    it('should return 404 when profile does not exist', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfile')
        .query({ did: 'did:example:nonexistent' })
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfile')
        .query({ did: authorDid })
        .expect(401);
    });

    it('should require did parameter', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfile')
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(400);
    });
  });

  describe('POST /xrpc/social.spkeasy.actor.deleteProfile', () => {
    it('should delete own profile', async () => {
      // Create session and profile
      const session = await prisma.profileSession.create({
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

      await prisma.privateProfile.create({
        data: {
          sessionId: session.id,
          authorDid,
          encryptedContent: Buffer.from('test-content'),
        },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.deleteProfile')
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify profile was deleted
      const profile = await prisma.privateProfile.findFirst({
        where: { authorDid },
      });
      expect(profile).toBeNull();
    });

    it('should return 404 when profile does not exist', async () => {
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
});
