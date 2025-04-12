import { z } from 'zod';
import { PrismaClient, UserKey } from '../generated/prisma-client/index.js';
import { ValidationError } from '@speakeasy-services/common';
import { Queue, JOB_NAMES } from '@speakeasy-services/queue';

const keySchema = z.object({
  id: z.string(),
  authorDid: z.string(),
  publicKey: z.string(),
  privateKey: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Key = z.infer<typeof keySchema>;

type PublicKeyResponse = {
  publicKey: string;
  authorDid: string;
};

/**
 * Service for managing user keys in the system.
 * Handles operations such as retrieving user keys and rotating them.
 */
export class KeyService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Retrieves the most recent active key for a given author.
   * @param authorDid - The DID (Decentralized Identifier) of the author
   * @returns A Promise that resolves to the UserKey object if found, or null if no active key exists
   */
  async getUserKey(authorDid: string): Promise<PublicKeyResponse | null> {
    const key = await this.prisma.userKey.findFirst({
      where: {
        authorDid,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        publicKey: true,
        authorDid: true,
      },
    });

    return key;
  }

  /**
   * Retrieves the most recent active key for any of the given authors.
   * @param authorDids - Array of DIDs (Decentralized Identifiers) to search for
   * @returns A Promise that resolves to the most recent UserKey object if found, or null if no active key exists for any of the provided DIDs
   */
  async getUserKeys(authorDids: string[]): Promise<PublicKeyResponse[]> {
    const keys = await this.prisma.userKey.findMany({
      where: {
        authorDid: { in: authorDids },
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        publicKey: true,
        authorDid: true,
      },
    });

    return keys;
  }

  /**
   * Requests a key rotation for a given author.
   * This operation:
   * 1. Locks the existing key row for update
   * 2. Checks if the current key was created within the last 5 minutes
   * 3. If an existing key exists and is older than 5 minutes, marks it as deleted
   * 4. Creates a new key with the provided public and private keys
   * 5. Publishes a job to update user keys if a previous key existed
   *
   * @param authorDid - The DID (Decentralized Identifier) of the author
   * @param publicKey - The new public key to be associated with the author
   * @param privateKey - The new private key to be associated with the author
   * @returns A Promise that resolves to the newly created UserKey object
   * @throws ValidationError if the current key was created within the last 5 minutes
   */
  async requestRotation(
    authorDid: string,
    publicKey: string,
    privateKey: string,
  ): Promise<UserKey | null> {
    return this.prisma.$transaction(
      async (tx) => {
        // Lock the row for update
        const keys = await tx.$queryRaw<
          UserKey[]
        >`SELECT * FROM user_key WHERE author_did = ${authorDid} FOR UPDATE`;

        const key = keys[0];

        if (key) {
          // if key was created in the last 5 minutes, don't rotate it
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          if (key.createdAt > fiveMinutesAgo) {
            throw new ValidationError(
              'Key was created too recently, try again later',
            );
          }

          await tx.userKey.update({
            where: { id: key.id },
            data: { deletedAt: new Date() },
          });
        }

        // Create new key
        const newKey = await tx.userKey.create({
          data: {
            authorDid,
            publicKey,
            privateKey,
          },
        });

        if (key) {
          Queue.publish(JOB_NAMES.UPDATE_USER_KEYS, {
            prevKeyId: key.id,
            newKeyId: newKey.id,
          });
        }

        return newKey;
      },
      {
        isolationLevel: 'RepeatableRead',
      },
    );
  }
}
