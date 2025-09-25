import { v4 as uuidv4 } from 'uuid';
import { getPrismaClient } from "../db.js";
import { Testimonial } from '../generated/prisma-client/index.js';

const prisma = getPrismaClient();

export class TestimonialService {
  /**
   * Creates a new testimonial from a user
   * @param userDid - The DID of the user creating the testimonial
   * @param message - The content of the testimonial
   * @returns The created testimonial
   */
  async createTestimonial(userDid: string, message: string): Promise<Testimonial> {
    const testimonial = await prisma.testimonial.create({
      data: {
        id: uuidv4(),
        userDid,
        message,
      },
    });

    return testimonial;
  }
}
