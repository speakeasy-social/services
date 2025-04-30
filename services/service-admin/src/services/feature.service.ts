import {
  PrismaClient,
  UserFeature,
  InviteCode,
} from '../generated/prisma-client/index.js';
import { NotFoundError, ValidationError } from '@speakeasy-services/common';
import { getPrismaClient } from '../db.js';

const prisma = getPrismaClient();

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
}
