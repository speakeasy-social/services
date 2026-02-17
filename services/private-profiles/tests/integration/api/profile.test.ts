import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import server from '../../../src/server.js';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import {
  mockBlueskySession,
  cleanupBlueskySessionMocks,
  verifyBlueskySessionMocks,
  generateTestToken,
} from '@speakeasy-services/test-utils';
import { safeBtoa } from '@speakeasy-services/common';
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
  });

  beforeEach(async () => {
    // Clear test data before each test
    await prisma.privateProfile.deleteMany();
    await prisma.sessionKey.deleteMany();
    await prisma.session.deleteMany();

    mockBlueskySession({ did: authorDid, host: 'http://localhost:2583' });
  });

  afterEach(() => {
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  describe('POST /xrpc/social.spkeasy.actor.putProfile', () => {
    it('should create a new profile', async () => {
      // First create a session
      const session = await prisma.session.create({
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

      // Use a realistic SafeText-encoded value to catch double-encoding bugs
      const encryptedContent = safeBtoa(new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]));

      const profileData = {
        sessionId: session.id,
        encryptedContent,
        avatarUri: 'https://example.com/avatar.jpg',
        bannerUri: 'https://example.com/banner.jpg',
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.putProfile')
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Content-Type', 'application/json')
        .send(profileData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify profile was created
      const profile = await prisma.privateProfile.findFirst({
        where: { authorDid },
      });
      expect(profile).not.toBeNull();
      expect(profile?.avatarUri).toBe('https://example.com/avatar.jpg');
      expect(profile?.bannerUri).toBe('https://example.com/banner.jpg');

      // Verify encryptedContent roundtrips correctly (catches Buffer.from double-encoding)
      const getResponse = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfile')
        .query({ did: authorDid })
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);

      expect(getResponse.body.profile.encryptedContent).toBe(encryptedContent);
    });

    it('should update an existing profile', async () => {
      // Create session and profile
      const session = await prisma.session.create({
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

      const updatedEncryptedContent = safeBtoa(new Uint8Array([99, 88, 77, 66, 55, 44, 33, 22, 11]));
      const updatedProfileData = {
        sessionId: session.id,
        encryptedContent: updatedEncryptedContent,
        avatarUri: 'https://example.com/new-avatar.jpg',
      };

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.putProfile')
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Content-Type', 'application/json')
        .send(updatedProfileData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify profile was updated
      const profile = await prisma.privateProfile.findFirst({
        where: { authorDid },
      });
      expect(profile?.avatarUri).toBe('https://example.com/new-avatar.jpg');

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
      const session = await prisma.session.create({
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
      expect(response.body.profile).toHaveProperty('did', authorDid);
      expect(response.body.profile).toHaveProperty('encryptedContent');
      expect(response.body.profile).toHaveProperty('encryptedDek');
      expect(response.body.profile).toHaveProperty('userKeyPairId', '00000000-0000-0000-0000-000000000001');
      expect(response.body.profile).toHaveProperty('avatarUri', 'https://example.com/avatar.jpg');
    });

    it('should get profile when caller is a session recipient', async () => {
      // Create session with both author and recipient having access
      const session = await prisma.session.create({
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
      expect(response.body.profile).toHaveProperty('did', authorDid);
      expect(response.body.profile).toHaveProperty('encryptedContent');
      expect(response.body.profile).toHaveProperty('encryptedDek');
      expect(response.body.profile).toHaveProperty('userKeyPairId', '00000000-0000-0000-0000-000000000002');
    });

    it('should return 404 when caller is not a session recipient', async () => {
      // Create session without otherUser as recipient
      const session = await prisma.session.create({
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

  describe('GET /xrpc/social.spkeasy.actor.getProfiles', () => {
    it('should return profiles the caller has access to', async () => {
      // Create session for author's profile with recipient having access
      const session1 = await prisma.session.create({
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
                encryptedDek: Buffer.from('recipient-session-key-for-author'),
                userKeyPairId: '00000000-0000-0000-0000-000000000002',
              },
            ],
          },
        },
      });

      // Create session for recipient's profile (only author has access, not otherUser)
      const session2 = await prisma.session.create({
        data: {
          authorDid: recipientDid,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionKeys: {
            create: {
              recipientDid: recipientDid,
              encryptedDek: Buffer.from('recipient-self-key'),
              userKeyPairId: '00000000-0000-0000-0000-000000000003',
            },
          },
        },
      });

      // Create profiles
      await prisma.privateProfile.create({
        data: {
          sessionId: session1.id,
          authorDid,
          encryptedContent: Buffer.from('author-profile-content'),
          avatarUri: 'https://example.com/author-avatar.jpg',
        },
      });

      await prisma.privateProfile.create({
        data: {
          sessionId: session2.id,
          authorDid: recipientDid,
          encryptedContent: Buffer.from('recipient-profile-content'),
        },
      });

      // Mock session for recipient
      cleanupBlueskySessionMocks();
      mockBlueskySession({ did: recipientDid, host: 'http://localhost:2583' });

      // Request both profiles - recipient should only see author's profile (has session key)
      // and their own profile
      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfiles')
        .query({ dids: [authorDid, recipientDid] })
        .set('Authorization', `Bearer ${recipientToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('profiles');
      expect(response.body.profiles).toHaveLength(2);

      const authorProfile = response.body.profiles.find((p: { did: string }) => p.did === authorDid);
      const recipientProfile = response.body.profiles.find((p: { did: string }) => p.did === recipientDid);

      expect(authorProfile).toBeDefined();
      expect(authorProfile).toHaveProperty('encryptedDek');
      expect(authorProfile).toHaveProperty('userKeyPairId', '00000000-0000-0000-0000-000000000002');

      expect(recipientProfile).toBeDefined();
      expect(recipientProfile).toHaveProperty('encryptedDek');
    });

    it('should return empty array when caller has no access to any profiles', async () => {
      // Create session for author's profile without otherUser
      const session = await prisma.session.create({
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

      // Mock session for other user
      cleanupBlueskySessionMocks();
      mockBlueskySession({ did: otherUserDid, host: 'http://localhost:2583' });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfiles')
        .query({ dids: [authorDid] })
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('profiles');
      expect(response.body.profiles).toHaveLength(0);
    });

    it('should require authentication', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfiles')
        .query({ dids: [authorDid] })
        .expect(401);
    });

    it('should require dids parameter', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.actor.getProfiles')
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(400);
    });
  });

  describe('POST /xrpc/social.spkeasy.actor.deleteProfile', () => {
    it('should delete own profile', async () => {
      // Create session and profile
      const session = await prisma.session.create({
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
