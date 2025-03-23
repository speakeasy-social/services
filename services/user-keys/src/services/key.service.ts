import { z } from 'zod';
import logger from '../utils/logger.js';
import { PrismaClient } from '@prisma/client';

const keySchema = z.object({
  id: z.string(),
  userId: z.string(),
  publicKey: z.string(),
  privateKey: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Key = z.infer<typeof keySchema>;

export interface KeyService {
  getPublicKey(userId: string): Promise<{ publicKey: string }>;
  getPrivateKey(): Promise<{ privateKey: string }>;
  requestRotation(): Promise<{ success: boolean }>;
}

export class KeyServiceImpl implements KeyService {
  async getPublicKey(userId: string): Promise<{ publicKey: string }> {
    logger.info({ userId }, 'Getting public key');
    throw new Error('Not implemented');
  }

  async getPrivateKey(): Promise<{ privateKey: string }> {
    logger.info('Getting private key');
    throw new Error('Not implemented');
  }

  async requestRotation(): Promise<{ success: boolean }> {
    logger.info('Requesting key rotation');
    throw new Error('Not implemented');
  }
}
