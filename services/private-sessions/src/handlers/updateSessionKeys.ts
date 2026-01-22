import { recryptDEK } from '@speakeasy-services/crypto';
import type { PrismaClient } from '../generated/prisma-client/index.js';
import type { UpdateSessionKeysJob } from './types.js';

export function createUpdateSessionKeysHandler(prisma: PrismaClient) {
  return async (job: { data: UpdateSessionKeysJob }) => {
    const { prevKeyId, newKeyId, prevPrivateKey, newPublicKey } = job.data;
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
