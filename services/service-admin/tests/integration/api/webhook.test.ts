import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import server from '../../../src/server.js';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import request from 'supertest';
import Stripe from 'stripe';

// Mock Stripe
vi.mock('stripe', () => {
  const mockStripe = {
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
  return {
    default: vi.fn(() => mockStripe),
  };
});

// Use unique DIDs for this test file to avoid conflicts with parallel test execution
const donorDid = 'did:plc:webhook-test-donor';

describe('Stripe Webhook Tests', () => {
  let prisma: PrismaClient;
  let mockStripeInstance: { webhooks: { constructEvent: ReturnType<typeof vi.fn> } };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await server.start();

    // Get the mocked Stripe instance
    mockStripeInstance = new (Stripe as unknown as new () => typeof mockStripeInstance)();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await server.shutdown();
  });

  beforeEach(async () => {
    // Clear test data for DIDs used in this test file only
    await prisma.contribution.deleteMany({
      where: { did: donorDid },
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('POST /webhooks/stripe', () => {
    it('should return 400 when stripe-signature header is missing', async () => {
      const response = await request(server.express)
        .post('/webhooks/stripe')
        .send(JSON.stringify({ type: 'checkout.session.completed' }))
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.text).toBe('Missing stripe-signature header');
    });

    it('should return 400 when signature verification fails', async () => {
      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const response = await request(server.express)
        .post('/webhooks/stripe')
        .send(JSON.stringify({ type: 'checkout.session.completed' }))
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'invalid_signature')
        .expect(400);

      expect(response.text).toContain('Webhook signature verification failed');
    });

    it('should skip contribution creation when donorDid is missing from metadata', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_test_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            metadata: {}, // No donorDid
            amount_total: 5000,
          } as unknown as Stripe.Checkout.Session,
        },
        api_version: '2023-10-16',
        created: Date.now(),
        livemode: false,
        object: 'event',
        pending_webhooks: 0,
        request: null,
      };

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const response = await request(server.express)
        .post('/webhooks/stripe')
        .send(JSON.stringify({ type: 'checkout.session.completed' }))
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .expect(200);

      expect(response.body).toEqual({ received: true });

      // Verify no contribution was created
      const contributions = await prisma.contribution.findMany({
        where: { did: donorDid },
      });
      expect(contributions).toHaveLength(0);
    });

    it('should create contribution when valid checkout.session.completed event is received', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_test_456',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_456',
            metadata: { donorDid },
            amount_total: 5000,
          } as unknown as Stripe.Checkout.Session,
        },
        api_version: '2023-10-16',
        created: Date.now(),
        livemode: false,
        object: 'event',
        pending_webhooks: 0,
        request: null,
      };

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const response = await request(server.express)
        .post('/webhooks/stripe')
        .send(JSON.stringify({ type: 'checkout.session.completed' }))
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .expect(200);

      expect(response.body).toEqual({ received: true });

      // Verify contribution was created
      const contribution = await prisma.contribution.findFirst({
        where: { did: donorDid, deletedAt: null },
      });
      expect(contribution).not.toBeNull();
      expect(contribution?.contribution).toBe('donor');
      expect(contribution?.details).toEqual({
        amount: 5000,
        donationId: 'cs_test_456',
      });
    });

    it('should handle duplicate donations by returning success without creating duplicate', async () => {
      const donationId = 'cs_test_duplicate';

      // Create existing contribution entry for this donation
      await prisma.contribution.create({
        data: {
          did: donorDid,
          contribution: 'donor',
          details: { amount: 5000, donationId },
        },
      });

      const mockEvent: Stripe.Event = {
        id: 'evt_test_dup',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: donationId, // Same donation ID
            metadata: { donorDid },
            amount_total: 5000,
          } as unknown as Stripe.Checkout.Session,
        },
        api_version: '2023-10-16',
        created: Date.now(),
        livemode: false,
        object: 'event',
        pending_webhooks: 0,
        request: null,
      };

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const response = await request(server.express)
        .post('/webhooks/stripe')
        .send(JSON.stringify({ type: 'checkout.session.completed' }))
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .expect(200);

      expect(response.body).toEqual({ received: true, duplicate: true });

      // Verify only one contribution entry exists
      const contributions = await prisma.contribution.findMany({
        where: { did: donorDid },
      });
      expect(contributions).toHaveLength(1);
    });

    it('should ignore non-checkout.session.completed events', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_test_other',
        type: 'payment_intent.succeeded', // Different event type
        data: {
          object: {} as Stripe.PaymentIntent,
        },
        api_version: '2023-10-16',
        created: Date.now(),
        livemode: false,
        object: 'event',
        pending_webhooks: 0,
        request: null,
      };

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const response = await request(server.express)
        .post('/webhooks/stripe')
        .send(JSON.stringify({ type: 'payment_intent.succeeded' }))
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .expect(200);

      expect(response.body).toEqual({ received: true });

      // Verify no contribution was created
      const contributions = await prisma.contribution.findMany({
        where: { did: donorDid },
      });
      expect(contributions).toHaveLength(0);
    });
  });
});
