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

const supporterDid = 'did:plc:supporter-user';
const nonSupporterDid = 'did:plc:non-supporter';

describe('Supporters API Tests', () => {
  let prisma: PrismaClient;
  const supporterToken = generateTestToken(supporterDid);
  const nonSupporterToken = generateTestToken(nonSupporterDid);

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await server.start();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await server.shutdown();
  });

  beforeEach(async () => {
    // Clear test data for DIDs used in this test file only (avoid conflicts with parallel tests)
    await prisma.testimonial.deleteMany({
      where: { did: { in: [supporterDid, nonSupporterDid] } },
    });
    await prisma.supporter.deleteMany({
      where: { did: { in: [supporterDid, nonSupporterDid] } },
    });

    // Setup mock for Bluesky session validation
    mockBlueskySession({ did: supporterDid, host: 'http://localhost:2583' });
  });

  afterEach(() => {
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  describe('checkSupporter endpoint', () => {
    it('should require auth', async () => {
      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.checkSupporter')
        .expect(401);

      expect(response.body.error).toBe('AuthenticationError');
    });

    it('should return false for non-supporter', async () => {
      mockBlueskySession({ did: nonSupporterDid, host: 'http://localhost:2583' });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.checkSupporter')
        .set('Authorization', `Bearer ${nonSupporterToken}`)
        .expect(200);

      expect(response.body.isSupporter).toBe(false);
      expect(response.body.contributions).toEqual([]);
    });

    it('should return true with contributions for supporter', async () => {
      await prisma.supporter.create({
        data: { did: supporterDid, contribution: 'founding_donor' },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.checkSupporter')
        .set('Authorization', `Bearer ${supporterToken}`)
        .expect(200);

      expect(response.body.isSupporter).toBe(true);
      expect(response.body.contributions).toEqual(['founding_donor']);
    });

    it('should return multiple contribution types for supporter with multiple contributions', async () => {
      await prisma.supporter.createMany({
        data: [
          { did: supporterDid, contribution: 'founding_donor' },
          { did: supporterDid, contribution: 'donor', details: { amount: 5000 } },
          { did: supporterDid, contribution: 'contributor', details: { feature: 'dark-mode' } },
        ],
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.checkSupporter')
        .set('Authorization', `Bearer ${supporterToken}`)
        .expect(200);

      expect(response.body.isSupporter).toBe(true);
      expect(response.body.contributions).toHaveLength(3);
      expect(response.body.contributions).toContain('founding_donor');
      expect(response.body.contributions).toContain('donor');
      expect(response.body.contributions).toContain('contributor');
    });
  });
});
