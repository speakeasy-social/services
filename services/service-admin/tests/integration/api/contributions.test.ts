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

const contributorDid = 'did:plc:contributor-user';
const nonContributorDid = 'did:plc:non-contributor';

describe('Contributions API Tests', () => {
  let prisma: PrismaClient;
  const contributorToken = generateTestToken(contributorDid);
  const nonContributorToken = generateTestToken(nonContributorDid);

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
      where: { did: { in: [contributorDid, nonContributorDid] } },
    });
    await prisma.contribution.deleteMany({
      where: { did: { in: [contributorDid, nonContributorDid] } },
    });

    // Setup mock for Bluesky session validation
    mockBlueskySession({ did: contributorDid, host: 'http://localhost:2583' });
  });

  afterEach(() => {
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  describe('checkContribution endpoint', () => {
    it('should require auth', async () => {
      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.checkContribution')
        .expect(400);

      expect(response.body.error).toBe('NoSessionError');
    });

    it('should return false for non-contributor', async () => {
      mockBlueskySession({ did: nonContributorDid, host: 'http://localhost:2583' });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.checkContribution')
        .set('Authorization', `Bearer ${nonContributorToken}`)
        .expect(200);

      expect(response.body.isContributor).toBe(false);
      expect(response.body.contributions).toEqual([]);
    });

    it('should return true with contributions for contributor', async () => {
      await prisma.contribution.create({
        data: { did: contributorDid, contribution: 'founding_donor' },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.checkContribution')
        .set('Authorization', `Bearer ${contributorToken}`)
        .expect(200);

      expect(response.body.isContributor).toBe(true);
      expect(response.body.contributions).toEqual(['founding_donor']);
    });

    it('should return multiple contribution types for contributor with multiple contributions', async () => {
      await prisma.contribution.createMany({
        data: [
          { did: contributorDid, contribution: 'founding_donor' },
          { did: contributorDid, contribution: 'donor', details: { amount: 5000 } },
          { did: contributorDid, contribution: 'contributor', details: { feature: 'dark-mode' } },
        ],
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.checkContribution')
        .set('Authorization', `Bearer ${contributorToken}`)
        .expect(200);

      expect(response.body.isContributor).toBe(true);
      expect(response.body.contributions).toHaveLength(3);
      expect(response.body.contributions).toContain('founding_donor');
      expect(response.body.contributions).toContain('donor');
      expect(response.body.contributions).toContain('contributor');
    });
  });
});
