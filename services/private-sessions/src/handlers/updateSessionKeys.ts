// SECURITY: This handler receives private key material (prevPrivateKey) via the job queue.
// Keys are encrypted in the queue when JOB_QUEUE_ENCRYPTION_KEY is set, but the server
// still holds decrypted private keys transiently in memory during recryption. This is a
// known limitation — future work should move to a client-side key management model where private
// keys never reach the server. See security review findings A1/A2.
import { recryptDEK } from '@speakeasy-services/crypto';
import { Queue } from '@speakeasy-services/queue';
import { asSafeText } from '@speakeasy-services/common';
import type { PrismaClient } from '../generated/prisma-client/index.js';
import type { UpdateSessionKeysJob } from './types.js';

export function createUpdateSessionKeysHandler(prisma: PrismaClient) {
  return async (job: { data: UpdateSessionKeysJob }) => {
    const { prevKeyId, newKeyId, _encrypted } = job.data;
    const prevPrivateKey = asSafeText(
      _encrypted === 'v1'
        ? Queue.decryptField(job.data.prevPrivateKey as string)
        : (job.data.prevPrivateKey as string),
    );
    const newPublicKey = asSafeText(
      _encrypted === 'v1'
        ? Queue.decryptField(job.data.newPublicKey as string)
        : (job.data.newPublicKey as string),
    );
    const BATCH_SIZE = 100;
    let hasMore = true;

    while (hasMore) {
      const sessionKeys = await prisma.sessionKey.findMany({
        where: { userKeyPairId: prevKeyId },
        take: BATCH_SIZE,
      });

      if (sessionKeys.length === 0) {
        hasMore = false;
        continue;
      }

      await Promise.all(
        sessionKeys.map(async (sessionKey) => {
          const newEncryptedDek = await recryptDEK(
            sessionKey,
            { privateKey: prevPrivateKey, userKeyPairId: prevKeyId },
            newPublicKey,
          );
          await prisma.sessionKey.update({
            where: {
              sessionId_recipientDid: {
                sessionId: sessionKey.sessionId,
                recipientDid: sessionKey.recipientDid,
              },
            },
            data: {
              userKeyPairId: newKeyId,
              encryptedDek: newEncryptedDek,
            },
          });
        }),
      );
    }
  };
}
