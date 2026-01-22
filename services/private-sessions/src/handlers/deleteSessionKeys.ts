import { speakeasyApiRequest } from '@speakeasy-services/common';
import type { PrismaClient } from '../generated/prisma-client/index.js';
import type { DeleteSessionKeysJob } from './types.js';

export function createDeleteSessionKeysHandler(prisma: PrismaClient) {
  return async (job: { data: DeleteSessionKeysJob }) => {
    const { authorDid, recipientDid } = job.data;

    // Check if the recipient is still trusted
    const trustedResult = await speakeasyApiRequest(
      {
        method: 'GET',
        path: 'social.spkeasy.graph.getTrusted',
        fromService: 'private-sessions',
        toService: 'trusted-users',
      },
      { authorDid, recipientDid },
    );

    if (trustedResult.trusted.length) {
      return { abortReason: 'Recipient has been trusted again' };
    }

    await prisma.sessionKey.deleteMany({
      where: { recipientDid, session: { authorDid } },
    });
  };
}
