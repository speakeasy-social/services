import { getPrismaClient } from '../db.js';
import { Prisma, Testimonial } from '../generated/prisma-client/index.js';
import type { ContributionPublicData } from '../types/contribution.js';

const prisma = getPrismaClient();

type TestimonialContent = {
  text: string;
  facets?: unknown[];
};

export type ContributionInfo = {
  createdAt: Date;
  contribution: string;
  public: ContributionPublicData | null;
};

export type TestimonialWithContributions = Testimonial & {
  contributions: ContributionInfo[];
};

export class TestimonialService {
  /**
   * Creates a new testimonial from a user
   * @param did - The DID of the user creating the testimonial
   * @param content - The content of the testimonial (text and optional facets)
   * @returns The created testimonial
   */
  async createTestimonial(
    did: string,
    content: TestimonialContent
  ): Promise<Testimonial> {
    return prisma.testimonial.create({
      data: {
        did,
        content: content as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Lists testimonials with optional filtering and pagination
   * @param options - Filtering and pagination options
   * @returns Testimonials and cursor for next page
   */
  async listTestimonials(options: {
    did?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ testimonials: TestimonialWithContributions[]; cursor: string | null }> {
    const { did, limit, cursor } = options;

    const where: Prisma.TestimonialWhereInput = { deletedAt: null };
    if (did) {
      where.did = did;
    }

    const testimonials = await prisma.testimonial.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to determine if there's a next page
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1, // Skip the cursor item
      }),
    });

    const hasMore = testimonials.length > limit;
    const results = hasMore ? testimonials.slice(0, limit) : testimonials;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    // Fetch contributions for all testimonial DIDs
    const dids = [...new Set(results.map((t) => t.did))];
    const contributionRecords = await prisma.contribution.findMany({
      where: {
        did: { in: dids },
        deletedAt: null,
      },
      select: {
        did: true,
        createdAt: true,
        contribution: true,
        public: true,
      },
    });

    // Group contributions by DID
    const contributionsByDid = new Map<string, ContributionInfo[]>();
    for (const record of contributionRecords) {
      const contributions = contributionsByDid.get(record.did) || [];
      contributions.push({
        createdAt: record.createdAt,
        contribution: record.contribution,
        public: (record.public as ContributionPublicData | null) ?? null,
      });
      contributionsByDid.set(record.did, contributions);
    }

    // Attach contributions to each testimonial
    const testimonialsWithContributions: TestimonialWithContributions[] = results.map(
      (testimonial) => ({
        ...testimonial,
        contributions: contributionsByDid.get(testimonial.did) || [],
      })
    );

    return {
      testimonials: testimonialsWithContributions,
      cursor: nextCursor,
    };
  }

  /**
   * Gets a single testimonial by ID
   * @param id - The ID of the testimonial
   * @returns The testimonial or null if not found
   */
  async getTestimonial(id: string): Promise<Testimonial | null> {
    return prisma.testimonial.findFirst({
      where: { id, deletedAt: null },
    });
  }

  /**
   * Soft deletes a testimonial by ID without authorization checks.
   * Authorization should be performed by the caller before invoking this method.
   * @param id - The ID of the testimonial to delete
   */
  async deleteTestimonialById(id: string): Promise<void> {
    await prisma.testimonial.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
