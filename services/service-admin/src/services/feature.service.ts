import { NotFoundError, RateLimitError, ValidationError } from '@speakeasy-services/common';
import Stripe from 'stripe';
import config from '../config.js';
import { getPrismaClient } from '../db.js';
import {
  InviteCode,
  UserFeature
} from '../generated/prisma-client/index.js';
import { Mode } from '../types.js';

const prisma = getPrismaClient();

const INVITE_CODE_USES = 6;
const RATE_LIMIT_DAYS = 7;
const FEATURE_KEY = 'private-posts';

/**
 * Generate a random invite code in XXXX-XXXX-XXXX format
 */
function generateInviteCodeString(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars: I, O, 0, 1
  const generateSegment = () => {
    let segment = '';
    for (let i = 0; i < 4; i++) {
      segment += chars[Math.floor(Math.random() * chars.length)];
    }
    return segment;
  };
  return `${generateSegment()}-${generateSegment()}-${generateSegment()}`;
}

type SelectedUserFeatures = Pick<UserFeature, 'userDid' | 'key' | 'value'>;

export class FeatureService {
  /**
   * Gets all features enabled for an actor
   * @param actorDid - The DID of the actor to get features for
   * @returns Promise containing the actor's features
   */
  async getFeatures(userDid: string): Promise<SelectedUserFeatures[]> {
    const features = await prisma.userFeature.findMany({
      where: { userDid },
      select: { userDid: true, key: true, value: true },
    });

    return features;
  }

  /**
   * Applies an invite code to enable a feature
   * @param actorDid - The DID of the actor applying the code
   * @param code - The invite code to apply
   * @returns Promise that resolves when the feature is enabled
   */
  async applyInviteCode(actorDid: string, code: string): Promise<void> {
    // Start a transaction to handle the invite code application
    await prisma.$transaction(async (tx) => {
      // Use raw query to get the invite code with FOR UPDATE lock
      const inviteCodes = await tx.$queryRaw<InviteCode[]>`
        SELECT * FROM invite_codes
        WHERE code = ${code}
        FOR UPDATE
      `;

      const inviteCode = inviteCodes[0];

      if (!inviteCode) {
        throw new NotFoundError('Invalid invite code');
      }

      // Check if user already has this feature
      const existingFeature = await tx.userFeature.findFirst({
        where: {
          userDid: actorDid,
          key: inviteCode.key,
        },
      });

      if (existingFeature) {
        throw new ValidationError('You already have this feature');
      }

      if (inviteCode.remainingUses <= 0) {
        throw new ValidationError('Invite code has been fully redeemed');
      }

      // Create the user feature
      const userFeature = await tx.userFeature.create({
        data: {
          userDid: actorDid,
          key: inviteCode.key,
          value: inviteCode.value,
        },
      });

      // Record the use
      await tx.inviteCodeUse.create({
        data: {
          inviteCodeId: inviteCode.id,
          userFeatureId: userFeature.id,
        },
      });

      // Decrement remaining uses
      await tx.inviteCode.update({
        where: { id: inviteCode.id },
        data: { remainingUses: { decrement: 1 } },
      });
    });
  }

  async donate(
    unitAmount: number,
    mode: Mode,
    currency: string,
    donorEmail?: string,
    donorDid?: string
  ): Promise<string | Error> {
    const normalizedCurrency = currency.toLowerCase();

    const paymentPriceData = {
      currency: normalizedCurrency,
      unit_amount: unitAmount,
      product_data: { name: 'One-time Donation' },
    }
    const subscriptionPriceData = {
      currency: normalizedCurrency,
      unit_amount: unitAmount,
      product_data: { name: 'Monthly Donation' },
      recurring: { interval: 'month' as const, interval_count: 1 }
    }
    const price_data = mode === 'payment' ? paymentPriceData : subscriptionPriceData

    const stripe = new Stripe(config.STRIPE_SECRET_KEY);
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode,
      ui_mode: 'embedded',
      return_url: `${config.SPKEASY_HOST}/supporters/add`,
      line_items: [{
        price_data,
        quantity: 1,
      }],
    };

    if (donorEmail) {
      sessionParams.customer_email = donorEmail;
    }

    // Store donor DID in metadata for webhook processing
    if (donorDid) {
      sessionParams.metadata = {
        donorDid,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    if (!session.client_secret) {
       throw new Error("Stripe API call did not return a client secret");
    }
    return session.client_secret;
  }

  /**
   * Generate a new invite code for the private-posts feature
   * @param creatorDid - The DID of the user generating the invite code
   * @returns Promise containing the generated code and remaining uses
   */
  async generateInviteCode(creatorDid: string): Promise<{ code: string; remainingUses: number }> {
    // 1. Check user has private-posts feature
    const hasFeature = await prisma.userFeature.findFirst({
      where: { userDid: creatorDid, key: FEATURE_KEY },
    });
    if (!hasFeature) {
      throw new ValidationError('You must have the private-posts feature enabled to generate invite codes', undefined, 'FeatureNotGranted');
    }

    // 2. Check per-user rate limit (user can only create 1 invite per 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - RATE_LIMIT_DAYS);

    const recentInvite = await prisma.inviteCode.findFirst({
      where: { creatorDid, createdAt: { gte: oneWeekAgo } },
    });
    if (recentInvite) {
      throw new RateLimitError('You can only generate one invite code per week');
    }

    // 3. Generate and create invite code
    const code = generateInviteCodeString();
    const inviteCode = await prisma.inviteCode.create({
      data: {
        code,
        creatorDid,
        key: FEATURE_KEY,
        value: 'true',
        totalUses: INVITE_CODE_USES,
        remainingUses: INVITE_CODE_USES,
      },
    });

    return { code: inviteCode.code, remainingUses: inviteCode.remainingUses };
  }

  /**
   * List all invite codes created by a user
   * @param creatorDid - The DID of the user whose invite codes to list
   * @returns Promise containing the list of invite codes
   */
  async listInviteCodes(creatorDid: string): Promise<{
    code: string;
    remainingUses: number;
    totalUses: number;
    createdAt: string;
  }[]> {
    const inviteCodes = await prisma.inviteCode.findMany({
      where: { creatorDid },
      select: {
        code: true,
        remainingUses: true,
        totalUses: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return inviteCodes.map((ic) => ({
      code: ic.code,
      remainingUses: ic.remainingUses,
      totalUses: ic.totalUses,
      createdAt: ic.createdAt.toISOString(),
    }));
  }
}
