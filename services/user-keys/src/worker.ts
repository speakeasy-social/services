import { Worker } from '@speakeasy-services/service-base';
import { JOB_NAMES } from '@speakeasy-services/queue';
import { speakeasyApiRequest } from '@speakeasy-services/common';
import { PrismaClient } from './generated/prisma-client/index.js';

interface UpdateUserKeysJob {
  prevKeyId: string;
  newKeyId: string;
}

const worker = new Worker({ name: 'user-keys-worker' });
const prisma = new PrismaClient();

/**
 * When keys are rotated, update sessions that use the old key
 */
worker.queue.work<UpdateUserKeysJob>(
  JOB_NAMES.UPDATE_USER_KEYS,
  async (job) => {
    const { prevKeyId, newKeyId } = job.data;

    // Fetch previous and new keys
    const keys = await prisma.userKey.findMany({
      where: {
        id: {
          in: [prevKeyId, newKeyId],
        },
      },
      select: {
        id: true,
        publicKey: true,
        privateKey: true,
      },
    });

    const prevKey = keys.find((k) => k.id === prevKeyId);
    const newKey = keys.find((k) => k.id === newKeyId);

    if (!prevKey || !newKey) {
      throw new Error('Failed to find one or both keys');
    }

    // Notify private-sessions service to update any sessions using the old key
    await speakeasyApiRequest(
      {
        method: 'POST',
        path: 'social.spkeasy.privateSession.updateKeys',
        fromService: 'user-keys',
        toService: 'private-sessions',
      },
      {
        prevKeyId,
        newKeyId,
        // We pass it the old private key so it can decrypt the session key
        prevPrivateKey: prevKey.privateKey,
        // We pass it the new public key so it can encrypt the session key
        newPublicKey: newKey.publicKey,
      },
    );
  },
);

worker.start().catch((error: Error) => {
  console.error('Failed to start worker:', error);
  throw error;
});
