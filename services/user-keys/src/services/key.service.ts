import { z } from 'zod';
import logger from '../utils/logger.js';
import { PrismaClient, UserKey } from '../generated/prisma-client/index.js';

const keySchema = z.object({
  id: z.string(),
  authorDid: z.string(),
  publicKey: z.string(),
  privateKey: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Key = z.infer<typeof keySchema>;

export interface KeyService {
  getPublicKey(authorDid: string): Promise<{ publicKey: string }>;
  getPrivateKey(): Promise<{ privateKey: string }>;
  requestRotation(): Promise<{ success: boolean }>;
}

export class KeyServiceImpl implements KeyService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async getPublicKey(authorDid: string): Promise<{ publicKey: string }> {
    const key = await this.getUserKey(authorDid);
    if (!key) {
      throw new Error('No key found for author');
    }
    return { publicKey: key.publicKey };
  }

  async getPrivateKey(): Promise<{ privateKey: string }> {
    throw new Error('Not implemented');
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

  async requestRotation(): Promise<{ success: boolean }> {
    logger.info('Requesting key rotation');
    throw new Error('Not implemented');
  }
}
