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

// Use unique DIDs for this test file to avoid conflicts with parallel test execution
const contributorDid = 'did:plc:testimonial-contributor';
const nonContributorDid = 'did:plc:testimonial-non-contributor';
const anotherContributorDid = 'did:plc:another-contributor';

describe('Testimonials API Tests', () => {
  let prisma: PrismaClient;
  const contributorToken = generateTestToken(contributorDid);
  const nonContributorToken = generateTestToken(nonContributorDid);
  const anotherContributorToken = generateTestToken(anotherContributorDid);

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
      where: { did: { in: [contributorDid, nonContributorDid, anotherContributorDid] } },
    });
    await prisma.contribution.deleteMany({
      where: { did: { in: [contributorDid, nonContributorDid, anotherContributorDid] } },
    });

    // Setup mock for Bluesky session validation
    mockBlueskySession({ did: contributorDid, host: 'http://localhost:2583' });
  });

  afterEach(() => {
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  describe('createTestimonial endpoint', () => {
    it('should return 403 for non-contributors', async () => {
      mockBlueskySession({ did: nonContributorDid, host: 'http://localhost:2583' });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.createTestimonial')
        .send({ content: { text: 'I love Speakeasy!' } })
        .set('Authorization', `Bearer ${nonContributorToken}`)
        .expect(403);

      expect(response.body.error).toBe('ForbiddenError');
      expect(response.body.message).toBe('You must be a contributor to create a testimonial');
    });

    it('should succeed for contributors', async () => {
      // Create contributor
      await prisma.contribution.create({
        data: { did: contributorDid, contribution: 'contributor', public: { feature: 'test' } },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.createTestimonial')
        .send({ content: { text: 'I love Speakeasy!' } })
        .set('Authorization', `Bearer ${contributorToken}`)
        .expect(200);

      expect(response.body.id).toBeDefined();
      expect(response.body.createdAt).toBeDefined();
    });

    it('should validate content.text is required', async () => {
      await prisma.contribution.create({
        data: { did: contributorDid, contribution: 'contributor', public: { feature: 'test' } },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.createTestimonial')
        .send({ content: {} })
        .set('Authorization', `Bearer ${contributorToken}`)
        .expect(400);

      expect(response.body.error).toBe('ValidationError');
    });

    it('should validate content.text max length 300', async () => {
      await prisma.contribution.create({
        data: { did: contributorDid, contribution: 'contributor', public: { feature: 'test' } },
      });

      const longText = 'a'.repeat(301);
      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.createTestimonial')
        .send({ content: { text: longText } })
        .set('Authorization', `Bearer ${contributorToken}`)
        .expect(400);

      expect(response.body.error).toBe('ValidationError');
    });

    it('should store facets when provided', async () => {
      await prisma.contribution.create({
        data: { did: contributorDid, contribution: 'contributor', public: { feature: 'test' } },
      });

      const facets = [{ index: { byteStart: 0, byteEnd: 5 }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'test' }] }];
      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.createTestimonial')
        .send({ content: { text: '#test post', facets } })
        .set('Authorization', `Bearer ${contributorToken}`)
        .expect(200);

      const testimonial = await prisma.testimonial.findUnique({
        where: { id: response.body.id },
      });
      expect((testimonial?.content as { facets?: unknown[] }).facets).toEqual(facets);
    });
  });

  describe('listTestimonials endpoint', () => {
    it('should work without auth', async () => {
      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.listTestimonials')
        .expect(200);

      expect(response.body.testimonials).toEqual([]);
      expect(response.body.cursor).toBeNull();
    });

    it('should return testimonials ordered by createdAt descending', async () => {
      await prisma.contribution.create({
        data: { did: contributorDid, contribution: 'donor', public: { isRegularGift: false }, internal: { amount: 1000 } },
      });

      // Create testimonials with different times
      await prisma.testimonial.create({
        data: { did: contributorDid, content: { text: 'First' }, createdAt: new Date('2024-01-01') },
      });
      await prisma.testimonial.create({
        data: { did: contributorDid, content: { text: 'Second' }, createdAt: new Date('2024-01-02') },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.listTestimonials')
        .expect(200);

      expect(response.body.testimonials).toHaveLength(2);
      expect((response.body.testimonials[0].content as { text: string }).text).toBe('Second');
      expect((response.body.testimonials[1].content as { text: string }).text).toBe('First');
    });

    it('should support pagination with limit', async () => {
      await prisma.contribution.create({
        data: { did: contributorDid, contribution: 'donor', public: { isRegularGift: false }, internal: { amount: 1000 } },
      });

      // Create 3 testimonials
      for (let i = 0; i < 3; i++) {
        await prisma.testimonial.create({
          data: { did: contributorDid, content: { text: `Testimonial ${i}` } },
        });
      }

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.listTestimonials')
        .query({ limit: 2 })
        .expect(200);

      expect(response.body.testimonials).toHaveLength(2);
      expect(response.body.cursor).not.toBeNull();
    });

    it('should support pagination with cursor', async () => {
      await prisma.contribution.create({
        data: { did: contributorDid, contribution: 'donor', public: { isRegularGift: false }, internal: { amount: 1000 } },
      });

      // Create 3 testimonials
      for (let i = 0; i < 3; i++) {
        await prisma.testimonial.create({
          data: { did: contributorDid, content: { text: `Testimonial ${i}` } },
        });
      }

      const firstPage = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.listTestimonials')
        .query({ limit: 2 })
        .expect(200);

      const secondPage = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.listTestimonials')
        .query({ limit: 2, cursor: firstPage.body.cursor })
        .expect(200);

      expect(secondPage.body.testimonials).toHaveLength(1);
      expect(secondPage.body.cursor).toBeNull();
    });

    it('should filter by did', async () => {
      await prisma.contribution.createMany({
        data: [
          { did: contributorDid, contribution: 'donor', public: { isRegularGift: false }, internal: { amount: 1000 } },
          { did: anotherContributorDid, contribution: 'donor', public: { isRegularGift: false }, internal: { amount: 500 } },
        ],
      });

      await prisma.testimonial.create({
        data: { did: contributorDid, content: { text: 'From contributor 1' } },
      });
      await prisma.testimonial.create({
        data: { did: anotherContributorDid, content: { text: 'From contributor 2' } },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.actor.listTestimonials')
        .query({ did: contributorDid })
        .expect(200);

      expect(response.body.testimonials).toHaveLength(1);
      expect(response.body.testimonials[0].did).toBe(contributorDid);
    });
  });

  describe('updateTestimonial endpoint', () => {
    it('should return 404 for non-existent testimonial', async () => {
      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.updateTestimonial')
        .send({ id: '00000000-0000-0000-0000-000000000000', content: { text: 'Updated' } })
        .set('Authorization', `Bearer ${contributorToken}`)
        .expect(404);

      expect(response.body.error).toBe('NotFoundError');
      expect(response.body.message).toBe('Testimonial not found');
    });

    it('should return 403 for non-author', async () => {
      await prisma.contribution.createMany({
        data: [
          { did: contributorDid, contribution: 'donor', public: { isRegularGift: false }, internal: { amount: 1000 } },
          { did: anotherContributorDid, contribution: 'donor', public: { isRegularGift: false }, internal: { amount: 500 } },
        ],
      });

      const testimonial = await prisma.testimonial.create({
        data: { did: contributorDid, content: { text: 'My testimonial' } },
      });

      mockBlueskySession({ did: anotherContributorDid, host: 'http://localhost:2583' });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.updateTestimonial')
        .send({ id: testimonial.id, content: { text: 'Hacked!' } })
        .set('Authorization', `Bearer ${anotherContributorToken}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should succeed for author and update content', async () => {
      await prisma.contribution.create({
        data: { did: contributorDid, contribution: 'contributor', public: { feature: 'test' } },
      });

      const testimonial = await prisma.testimonial.create({
        data: { did: contributorDid, content: { text: 'Original text' } },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.updateTestimonial')
        .send({ id: testimonial.id, content: { text: 'Updated text' } })
        .set('Authorization', `Bearer ${contributorToken}`)
        .expect(200);

      expect(response.body.id).toBe(testimonial.id);
      expect(response.body.createdAt).toBeDefined();

      // Verify content was updated in DB
      const updated = await prisma.testimonial.findUnique({
        where: { id: testimonial.id },
      });
      expect((updated?.content as { text: string }).text).toBe('Updated text');
    });

    it('should validate content.text is required', async () => {
      await prisma.contribution.create({
        data: { did: contributorDid, contribution: 'contributor', public: { feature: 'test' } },
      });

      const testimonial = await prisma.testimonial.create({
        data: { did: contributorDid, content: { text: 'Original' } },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.updateTestimonial')
        .send({ id: testimonial.id, content: {} })
        .set('Authorization', `Bearer ${contributorToken}`)
        .expect(400);

      expect(response.body.error).toBe('ValidationError');
    });

    it('should validate content.text max length 300', async () => {
      await prisma.contribution.create({
        data: { did: contributorDid, contribution: 'contributor', public: { feature: 'test' } },
      });

      const testimonial = await prisma.testimonial.create({
        data: { did: contributorDid, content: { text: 'Original' } },
      });

      const longText = 'a'.repeat(301);
      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.updateTestimonial')
        .send({ id: testimonial.id, content: { text: longText } })
        .set('Authorization', `Bearer ${contributorToken}`)
        .expect(400);

      expect(response.body.error).toBe('ValidationError');
    });

    it('should update facets', async () => {
      await prisma.contribution.create({
        data: { did: contributorDid, contribution: 'contributor', public: { feature: 'test' } },
      });

      const testimonial = await prisma.testimonial.create({
        data: { did: contributorDid, content: { text: 'Original' } },
      });

      const facets = [{ index: { byteStart: 0, byteEnd: 5 }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'updated' }] }];
      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.updateTestimonial')
        .send({ id: testimonial.id, content: { text: '#updated post', facets } })
        .set('Authorization', `Bearer ${contributorToken}`)
        .expect(200);

      expect(response.body.id).toBe(testimonial.id);

      const updated = await prisma.testimonial.findUnique({
        where: { id: testimonial.id },
      });
      expect((updated?.content as { text: string; facets?: unknown[] }).text).toBe('#updated post');
      expect((updated?.content as { text: string; facets?: unknown[] }).facets).toEqual(facets);
    });
  });

  describe('deleteTestimonial endpoint', () => {
    it('should return 404 for non-existent testimonial', async () => {
      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.deleteTestimonial')
        .send({ id: '00000000-0000-0000-0000-000000000000' })
        .set('Authorization', `Bearer ${contributorToken}`)
        .expect(404);

      expect(response.body.error).toBe('NotFoundError');
      expect(response.body.message).toBe('Testimonial not found');
    });

    it('should return 403 for non-author', async () => {
      await prisma.contribution.createMany({
        data: [
          { did: contributorDid, contribution: 'donor', public: { isRegularGift: false }, internal: { amount: 1000 } },
          { did: anotherContributorDid, contribution: 'donor', public: { isRegularGift: false }, internal: { amount: 500 } },
        ],
      });

      const testimonial = await prisma.testimonial.create({
        data: { did: contributorDid, content: { text: 'My testimonial' } },
      });

      mockBlueskySession({ did: anotherContributorDid, host: 'http://localhost:2583' });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.deleteTestimonial')
        .send({ id: testimonial.id })
        .set('Authorization', `Bearer ${anotherContributorToken}`)
        .expect(403);

      // Authorization errors return generic 'Forbidden' without details for security
      expect(response.body.error).toBe('Forbidden');
    });

    it('should succeed for author', async () => {
      await prisma.contribution.create({
        data: { did: contributorDid, contribution: 'donor', public: { isRegularGift: false }, internal: { amount: 1000 } },
      });

      const testimonial = await prisma.testimonial.create({
        data: { did: contributorDid, content: { text: 'My testimonial' } },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.actor.deleteTestimonial')
        .send({ id: testimonial.id })
        .set('Authorization', `Bearer ${contributorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify soft deletion (record exists but has deletedAt set)
      const deleted = await prisma.testimonial.findUnique({
        where: { id: testimonial.id },
      });
      expect(deleted).not.toBeNull();
      expect(deleted?.deletedAt).not.toBeNull();
    });
  });
});
