import { getPrismaClient } from '../db.js';
import { Prisma, Supporter } from '../generated/prisma-client/index.js';

const prisma = getPrismaClient();

type JsonValue = Prisma.InputJsonValue | typeof Prisma.JsonNull;

export class SupporterService {
  /**
   * Adds a new supporter entry
   * @param did - The DID of the supporter
   * @param contribution - The type of contribution (founding_donor, donor, contributor)
   * @param details - Optional details about the contribution
   * @returns The created supporter entry
   */
  async addSupporter(
    did: string,
    contribution: string,
    details: object | null
  ): Promise<Supporter> {
    return prisma.supporter.create({
      data: {
        did,
        contribution,
        details: details === null ? Prisma.JsonNull : (details as JsonValue),
      },
    });
  }

  /**
   * Checks if a user is a supporter (has at least one entry in supporters table)
   * @param did - The DID to check
   * @returns true if the user is a supporter
   */
  async isSupporter(did: string): Promise<boolean> {
    const count = await prisma.supporter.count({
      where: { did },
    });
    return count > 0;
  }

  /**
   * Gets all contribution types for a user
   * @param did - The DID to get contributions for
   * @returns Array of contribution type strings
   */
  async getContributions(did: string): Promise<string[]> {
    const supporters = await prisma.supporter.findMany({
      where: { did },
      select: { contribution: true },
      distinct: ['contribution'],
    });
    return supporters.map((s) => s.contribution);
  }

  /**
   * Finds a recent supporter entry by DID and donation ID (for deduplication)
   * @param did - The DID to search for
   * @param donationId - The Stripe donation ID to match in details
   * @param days - Number of days to look back
   * @returns The matching supporter entry or null
   */
  async findRecentByDidAndDonationId(
    did: string,
    donationId: string,
    days: number
  ): Promise<Supporter | null> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const supporters = await prisma.supporter.findMany({
      where: {
        did,
        createdAt: { gte: cutoffDate },
      },
    });

    // Check details JSON for matching donationId
    for (const supporter of supporters) {
      const details = supporter.details as { donationId?: string } | null;
      if (details?.donationId === donationId) {
        return supporter;
      }
    }

    return null;
  }
}
