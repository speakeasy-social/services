import type { PrismaClient } from '../generated/prisma-client/index.js';
import type { RevokeSessionJob } from './types.js';

export function createRevokeSessionHandler(prisma: PrismaClient) {
  return async (job: { data: RevokeSessionJob }) => {
    const { authorDid, recipientDid } = job.data;

    await prisma.session.updateMany({
      where: { authorDid, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });

    // If a recipient was untrusted, delete their sessions keys
    if (recipientDid) {
      await prisma.sessionKey.deleteMany({
        where: {
          session: {
            authorDid,
          },
          recipientDid,
        },
      });
    }
  };
}
