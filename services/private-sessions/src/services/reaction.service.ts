import { PrismaClient, Reaction } from '../generated/prisma-client/index.js';
import { getPrismaClient } from '../db.js';

const prisma = getPrismaClient();

export class ReactionService {
  /**
   * Creates a new reaction (like) for a post
   * @param userDid - The DID of the user creating the reaction
   * @param uri - The URI of the post being reacted to
   * @returns The created reaction
   */
  async createReaction(userDid: string, uri: string): Promise<Reaction> {
    const reaction = await prisma.reaction.create({
      data: {
        userDid,
        uri,
      },
    });

    return reaction;
  }

  /**
   * Deletes a reaction (like) for a post
   * @param userDid - The DID of the user deleting the reaction
   * @param uri - The URI of the post being unreacted to
   */
  async deleteReaction(userDid: string, uri: string): Promise<void> {
    await prisma.reaction.deleteMany({
      where: {
        userDid,
        uri,
      },
    });
  }
}
