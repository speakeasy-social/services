import { speakeasyApiRequest } from '@speakeasy-services/common';
import type { PrismaClient } from '../generated/prisma-client/index.js';
import type { UpdateUserKeysJob } from './types.js';

export function createUpdateUserKeysHandler(prisma: PrismaClient) {
  return async (job: { data: UpdateUserKeysJob }) => {
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
  };
}
