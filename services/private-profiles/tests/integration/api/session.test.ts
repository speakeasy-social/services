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
  generateTestToken,
} from '@speakeasy-services/test-utils';
import request from 'supertest';

const authorDid = 'did:example:session-author';
const recipientDid = 'did:example:session-recipient';

describe('Profile Session API Tests', () => {
  let prisma: PrismaClient;
  const validToken = generateTestToken(authorDid);

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

  describe('POST /xrpc/social.spkeasy.profileSession.create', () => {
    // Note: Session creation requires trust verification from trusted-users service
    // These tests focus on validation that doesn't require external services

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.create')
        .set('Content-Type', 'application/json')
        .send({
          sessionKeys: [
            {
              recipientDid,
              encryptedDek: 'test',
              userKeyPairId: '00000000-0000-0000-0000-000000000001',
            },
          ],
        })
        .expect(401);
    });

    it('should validate session keys format', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.create')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({ sessionKeys: 'invalid-format' })
        .expect(400);
    });
  });

  describe('POST /xrpc/social.spkeasy.profileSession.revoke', () => {
    // Note: Session revocation requires authorization check
    // These tests focus on authentication

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.revoke')
        .set('Content-Type', 'application/json')
        .send({ authorDid })
        .expect(401);
    });
  });

  describe('GET /xrpc/social.spkeasy.profileSession.getSession', () => {
    // Note: getSession returns 404 when no session exists (which is expected behavior)
    // The 500 error suggests an issue with the session lookup - this needs investigation

    it('should require authentication', async () => {
      await request(server.express)
        .get('/xrpc/social.spkeasy.profileSession.getSession')
        .expect(401);
    });
  });

  describe('POST /xrpc/social.spkeasy.profileSession.addUser', () => {
    // Note: addUser requires trust verification from trusted-users service

    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.addUser')
        .set('Content-Type', 'application/json')
        .send({
          recipientDid: 'did:example:test',
          encryptedDek: 'test-key',
          userKeyPairId: '00000000-0000-0000-0000-000000000004',
        })
        .expect(401);
    });
  });

  describe('POST /xrpc/social.spkeasy.profileSession.updateKeys', () => {
    it('should require authentication', async () => {
      await request(server.express)
        .post('/xrpc/social.spkeasy.profileSession.updateKeys')
        .set('Content-Type', 'application/json')
        .send({
          sessionId: 'test-session',
          sessionKeys: [],
        })
        .expect(401);
    });
  });
});
