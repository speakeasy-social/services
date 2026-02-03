import { getPrismaClient } from '../db.js';
import { Prisma, Contribution } from '../generated/prisma-client/index.js';

const prisma = getPrismaClient();

type JsonValue = Prisma.InputJsonValue | typeof Prisma.JsonNull;

export class ContributionService {
  /**
   * Adds a new contribution entry
   * @param did - The DID of the contributor
   * @param contribution - The type of contribution (founding_donor, donor, contributor)
   * @param details - Optional details about the contribution
   * @returns The created contribution entry
   */
  async addContribution(
    did: string,
    contribution: string,
    details: object | null
  ): Promise<Contribution> {
    return prisma.contribution.create({
      data: {
        did,
        contribution,
        details: details === null ? Prisma.JsonNull : (details as JsonValue),
      },
    });
  }

  /**
   * Checks if a user is a contributor (has at least one entry in contributions table)
   * @param did - The DID to check
   * @returns true if the user is a contributor
   */
  async isContributor(did: string): Promise<boolean> {
    const count = await prisma.contribution.count({
      where: { did, deletedAt: null },
    });
    return count > 0;
  }

  /**
   * Gets all contribution types for a user
   * @param did - The DID to get contributions for
   * @returns Array of contribution type strings
   */
  async getContributions(did: string): Promise<string[]> {
    const contributions = await prisma.contribution.findMany({
      where: { did, deletedAt: null },
      select: { contribution: true },
      distinct: ['contribution'],
    });
    return contributions.map((c) => c.contribution);
  }

  /**
   * Finds a recent contribution entry by DID and donation ID (for deduplication)
   * @param did - The DID to search for
   * @param donationId - The Stripe donation ID to match in details
   * @param days - Number of days to look back
   * @returns The matching contribution entry or null
   */
  async findRecentByDidAndDonationId(
    did: string,
    donationId: string,
    days: number
  ): Promise<Contribution | null> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return prisma.contribution.findFirst({
      where: {
        did,
        deletedAt: null,
        createdAt: { gte: cutoffDate },
        details: {
          path: ['donationId'],
          equals: donationId,
        },
      },
    });
  }
}
