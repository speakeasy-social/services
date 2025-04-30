import { Worker } from '@speakeasy-services/service-base';
import { JOB_NAMES } from '@speakeasy-services/queue';
import { speakeasyApiRequest } from '@speakeasy-services/common';
import { PrismaClient } from './generated/prisma-client/index.js';
import { recryptDEK } from '@speakeasy-services/crypto';
import { healthCheck } from './health.js';
interface AddRecipientToSessionJob {
  authorDid: string;
  recipientDid: string;
}

interface RotateSessionJob {
  authorDid: string;
  recipientDid?: string;
}

interface UpdateSessionKeysJob {
  prevKeyId: string;
  newKeyId: string;
  prevPrivateKey: string;
  newPublicKey: string;
}

const worker = new Worker({
  name: 'ptivate-sessions-worker',
  healthCheck,
  port: 4001,
});
const prisma = new PrismaClient();

// Add a new recipient to 30 days prior
const WINDOW_FOR_NEW_TRUSTED_USER = 30 * 24 * 60 * 60 * 1000;

/**
 * When a new recipient is added, add them to prior sessions.
 */
worker.work<AddRecipientToSessionJob>(
  JOB_NAMES.ADD_RECIPIENT_TO_SESSION,
  async (job) => {
    // FIXME we need some aborts to handle various kinds of debouncing
    // We should about the job if
    // * User has since untrusted the recipient
    // * The session has already been updated

    const { authorDid, recipientDid } = job.data;

    const sessions = await prisma.session.findMany({
      where: {
        authorDid,
        createdAt: { gt: new Date(Date.now() - WINDOW_FOR_NEW_TRUSTED_USER) },
      },
      include: {
        sessionKeys: {
          where: {
            recipientDid: authorDid,
          },
        },
      },
    });
    const sessionsWithKeys = sessions.filter(
      (session) => session.sessionKeys.length > 0,
    );

    // User hasn't yet made any private posts, we can stop here
    if (sessionsWithKeys.length === 0) {
      return;
    }

    if (sessions.length > sessionsWithKeys.length) {
      worker.logger.error(
        `Some sessions for ${authorDid} do not have author session keys (${sessions.length} sessions, ${sessionsWithKeys.length})`,
      );
    }

    if (!sessionsWithKeys.length) {
      return;
    }

    const sessionKeyPairIds = sessionsWithKeys.map(
      (session) => session.sessionKeys[0].userKeyPairId,
    );

    // Get the author's private keys and the recipient's public key
    // so we can re-encrypt the DEKs for the new recipient
    const [authorPrivateKeysBody, recipientPublicKeyBody] = await Promise.all([
      speakeasyApiRequest(
        {
          method: 'GET',
          path: 'social.spkeasy.key.getPrivateKeys',
          fromService: 'private-sessions',
          toService: 'user-keys',
        },
        { ids: [sessionKeyPairIds], did: authorDid },
      ),
      // This will trigger a new key if the recipient doesn't have one
      speakeasyApiRequest(
        {
          method: 'GET',
          path: 'social.spkeasy.key.getPublicKey',
          fromService: 'private-sessions',
          toService: 'user-keys',
        },
        { did: recipientDid },
      ),
    ]);

    const authorPrivateKeys: {
      userKeyPairId: string;
      privateKey: string;
    }[] = authorPrivateKeysBody.keys;

    // Create a map of userKeyPairId to privateKey
    const authorPrivateKeysMap = new Map(
      authorPrivateKeys.map((key) => [key.userKeyPairId, key]),
    );

    const newSessionKeys = (
      await Promise.all(
        sessionsWithKeys.map(async (session) => {
          const privateKey = authorPrivateKeysMap.get(
            session.sessionKeys[0].userKeyPairId,
          );

          if (!privateKey) {
            return null;
          }

          const encryptedDek = await recryptDEK(
            session.sessionKeys[0],
            privateKey,
            recipientPublicKeyBody.publicKey,
          );

          return {
            sessionId: session.id,
            recipientDid,
            encryptedDek,
            userKeyPairId: recipientPublicKeyBody.userKeyPairId,
          };
        }),
      )
    ).filter((val) => !!val);

    await prisma.sessionKey.createMany({
      data: newSessionKeys,
    });
  },
);

/**
 * Mark any active sessions as revoked
 * New session will be created next time they send a message
 */
worker.queue.work<RotateSessionJob>(JOB_NAMES.REVOKE_SESSION, async (job) => {
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
});

/**
 * Update session keys in batches when user keys are rotated
 */
worker.queue.work<UpdateSessionKeysJob>(
  JOB_NAMES.UPDATE_SESSION_KEYS,
  async (job) => {
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
  },
);

worker.start().catch((error: Error) => {
  console.error('Failed to start worker:', error);
  throw error;
});
