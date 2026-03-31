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
  generateTestServiceToken,
} from '@speakeasy-services/test-utils';
import request from 'supertest';

const authorDid = 'did:plc:excluded-profile-author';
const author2Did = 'did:plc:excluded-profile-author2';
const viewerDid = 'did:plc:excluded-profile-viewer';
const noProfileDid = 'did:plc:excluded-no-profile';

describe('getExcludedProfileDids API Tests', () => {
  let prisma: PrismaClient;
  const serviceAdminToken = generateTestServiceToken('service-admin');
  const userToken = generateTestToken(viewerDid);

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await server.start();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.privateProfile.deleteMany();
    await prisma.sessionKey.deleteMany();
    await prisma.session.deleteMany();
  });

  afterEach(() => {
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  it('should return empty array when no input DIDs have private profiles', async () => {
    const response = await request(server.express)
      .get('/xrpc/social.spkeasy.actor.getExcludedProfileDids')
      .query({ dids: [noProfileDid] })
      .set('Authorization', `Bearer ${serviceAdminToken}`)
      .expect(200);

    expect(response.body.excludedDids).toEqual([]);
  });

  it('should return all DIDs with private profiles when no viewerDid', async () => {
    // Create sessions and profiles for two authors
    const session1 = await prisma.session.create({
      data: {
        authorDid,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await prisma.privateProfile.create({
      data: {
        authorDid,
        sessionId: session1.id,
        encryptedContent: Buffer.from('encrypted-content-1'),
      },
    });

    const session2 = await prisma.session.create({
      data: {
        authorDid: author2Did,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await prisma.privateProfile.create({
      data: {
        authorDid: author2Did,
        sessionId: session2.id,
        encryptedContent: Buffer.from('encrypted-content-2'),
      },
    });

    const response = await request(server.express)
      .get('/xrpc/social.spkeasy.actor.getExcludedProfileDids')
      .query({ dids: [authorDid, author2Did, noProfileDid] })
      .set('Authorization', `Bearer ${serviceAdminToken}`)
      .expect(200);

    expect(response.body.excludedDids).toHaveLength(2);
    expect(response.body.excludedDids).toContain(authorDid);
    expect(response.body.excludedDids).toContain(author2Did);
  });

  it('should exclude only DIDs where viewer has no session key access', async () => {
    // Create session with session key for viewer (viewer has access)
    const session1 = await prisma.session.create({
      data: {
        authorDid,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        sessionKeys: {
          create: {
            recipientDid: viewerDid,
            encryptedDek: Buffer.from('viewer-dek'),
            userKeyPairId: '00000000-0000-0000-0000-000000000001',
          },
        },
      },
    });
    await prisma.privateProfile.create({
      data: {
        authorDid,
        sessionId: session1.id,
        encryptedContent: Buffer.from('encrypted-content-1'),
      },
    });

    // Create session WITHOUT session key for viewer (no access)
    const session2 = await prisma.session.create({
      data: {
        authorDid: author2Did,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await prisma.privateProfile.create({
      data: {
        authorDid: author2Did,
        sessionId: session2.id,
        encryptedContent: Buffer.from('encrypted-content-2'),
      },
    });

    const response = await request(server.express)
      .get('/xrpc/social.spkeasy.actor.getExcludedProfileDids')
      .query({ dids: [authorDid, author2Did], viewerDid })
      .set('Authorization', `Bearer ${serviceAdminToken}`)
      .expect(200);

    // Only author2Did should be excluded (viewer has no access)
    expect(response.body.excludedDids).toEqual([author2Did]);
  });

  it('should reject non-service auth', async () => {
    mockBlueskySession({ did: viewerDid, host: 'http://localhost:2583' });

    await request(server.express)
      .get('/xrpc/social.spkeasy.actor.getExcludedProfileDids')
      .query({ dids: [authorDid] })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });
});
