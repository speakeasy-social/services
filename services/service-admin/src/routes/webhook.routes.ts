import { Request, Response } from 'express';
import Stripe from 'stripe';
import config from '../config.js';
import { ContributionService } from '../services/contribution.service.js';
import { createLogger } from '@speakeasy-services/common';

const logger = createLogger({ serviceName: 'service-admin' });
const stripe = new Stripe(config.STRIPE_SECRET_KEY);
const contributionService = new ContributionService();

/** Number of days to look back when checking for duplicate donations */
const DONATION_DEDUP_WINDOW_DAYS = 30;

/**
 * Stripe webhook handler for checkout.session.completed events.
 * Auto-adds donors as contributors after successful payment.
 */
export async function handleStripeWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    logger.warn('Stripe webhook received without signature');
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  let event: Stripe.Event;

  try {
    // req.body should be the raw body (Buffer) for signature verification
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      config.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(
      { error: message },
      'Stripe webhook signature verification failed',
    );
    res.status(400).send(`Webhook signature verification failed: ${message}`);
    return;
  }

  // Handle checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    const donorDid = session.metadata?.donorDid;
    if (!donorDid) {
      logger.info(
        'Stripe checkout completed without donorDid in metadata, skipping contribution creation',
      );
      res.status(200).json({ received: true });
      return;
    }

    const amountTotal = session.amount_total;
    const donationId = session.id;

    // Check for duplicate (same donationId in last 30 days)
    const existingDonation =
      await contributionService.findRecentByDidAndDonationId(
        donorDid,
        donationId,
        DONATION_DEDUP_WINDOW_DAYS,
      );

    if (existingDonation) {
      logger.info(
        { donorDid, donationId },
        'Duplicate webhook detected, skipping',
      );
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    // Create contribution entry
    const contribution = await contributionService.addContribution(
      donorDid,
      'donor',
      { isRegularGift: session.mode === 'subscription' },
      { amount: amountTotal ?? 0, donationId },
    );

    logger.info(
      { contributionId: contribution.id, donorDid, amount: amountTotal },
      'Created contribution entry from Stripe donation',
    );
  }

  res.status(200).json({ received: true });
}
