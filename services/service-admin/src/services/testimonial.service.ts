import { ForbiddenError, NotFoundError } from '@speakeasy-services/common';
import { getPrismaClient } from '../db.js';
import { Prisma, Testimonial } from '../generated/prisma-client/index.js';

const prisma = getPrismaClient();

type TestimonialContent = {
  text: string;
  facets?: unknown[];
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
  }): Promise<{ testimonials: Testimonial[]; cursor: string | null }> {
    const { did, limit, cursor } = options;

    const where: Prisma.TestimonialWhereInput = {};
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

    return {
      testimonials: results,
      cursor: nextCursor,
    };
  }

  /**
   * Deletes a testimonial by ID
   * @param id - The ID of the testimonial to delete
   * @param requesterDid - The DID of the user requesting deletion (for authorization)
   * @throws NotFoundError if testimonial doesn't exist
   * @throws ForbiddenError if requester is not the author
   */
  async deleteTestimonial(id: string, requesterDid: string): Promise<void> {
    const testimonial = await prisma.testimonial.findUnique({
      where: { id },
    });

    if (!testimonial) {
      throw new NotFoundError('Testimonial not found');
    }

    if (testimonial.did !== requesterDid) {
      throw new ForbiddenError('You can only delete your own testimonials');
    }

    await prisma.testimonial.delete({
      where: { id },
    });
  }

  /**
   * Gets a single testimonial by ID
   * @param id - The ID of the testimonial
   * @returns The testimonial or null if not found
   */
  async getTestimonial(id: string): Promise<Testimonial | null> {
    return prisma.testimonial.findUnique({
      where: { id },
    });
  }

  /**
   * Deletes a testimonial by ID without authorization checks.
   * Authorization should be performed by the caller before invoking this method.
   * @param id - The ID of the testimonial to delete
   */
  async deleteTestimonialById(id: string): Promise<void> {
    await prisma.testimonial.delete({
      where: { id },
    });
  }
}
