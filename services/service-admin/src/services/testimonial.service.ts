// import { v4 as uuidv4 } from 'uuid';
import { getPrismaClient } from "../db.js";
import { Testimonial } from '../generated/prisma-client/index.js';
import Debug from '@prisma/debug'

const prisma = getPrismaClient();
export class TestimonialService {
  /**
   * Creates a new testimonial from a user
   * @param userDid - The DID of the user creating the testimonial
   * @param message - The content of the testimonial
   * @returns The created testimonial
   */
  async createTestimonial(userDid: string, message: string): Promise<string> {
  // async createTestimonial(userDid: string, message: string): Promise<Testimonial> {

    // const uuid = `urn:uuid:${uuidv4()}`
    console.log("*******************")
    // console.log("uuid: ", uuid)
    console.log("userDid: ", userDid)
    // const debug = Debug('prisma:client')
    // debug('Hello World')

    const testimonial = await prisma.testimonial.create({
      data: {
        // id: `urn:uuid:${uuid}`,
        userDid,
        message: "Something",
      },
    });

    return "Hello";
  }
}
