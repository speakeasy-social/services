import { Reaction } from '../generated/prisma-client/index.js';
import { getPrismaClient } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

import { Queue } from '@speakeasy-services/queue';
import { JOB_NAMES } from '@speakeasy-services/queue';

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
        id: uuidv4(),
        userDid,
        uri,
      },
    });

    await Queue.publish(JOB_NAMES.NOTIFY_REACTION, {
      uri,
      authorDid: userDid,
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
