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

export class KeyService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async getUserKey(authorDid: string): Promise<UserKey | null> {
    const key = await this.prisma.userKey.findFirst({
      where: {
        authorDid,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return key;
  }

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
