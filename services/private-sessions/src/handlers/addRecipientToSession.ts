import { speakeasyApiRequest } from '@speakeasy-services/common';
import { recryptDEK } from '@speakeasy-services/crypto';
import type { PrismaClient } from '../generated/prisma-client/index.js';
import type { AddRecipientToSessionJob } from './types.js';
import type { Logger } from 'pino';

// Add a new recipient to 30 days prior
const WINDOW_FOR_NEW_TRUSTED_USER = 30 * 24 * 60 * 60 * 1000;

export function createAddRecipientToSessionHandler(
  prisma: PrismaClient,
  logger: Logger,
) {
  return async (job: { data: AddRecipientToSessionJob }) => {
    logger.info('Adding recipient to session');

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

    if (!trustedResult.trusted.length) {
      return { abortReason: 'Recipient no longer trusted' };
    }

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
    const sessionsWithAuthorKeys = sessions.filter(
      (session) => session.sessionKeys.length > 0,
    );

    // User hasn't yet made any private posts, we can stop here
    if (sessionsWithAuthorKeys.length === 0) {
      return;
    }

    // Something went wrong if there are sessions without author keys
    if (sessions.length > sessionsWithAuthorKeys.length) {
      logger.error(
        `Some sessions for ${authorDid} do not have author session keys (${sessions.length} sessions, ${sessionsWithAuthorKeys.length})`,
      );
    }

    if (!sessionsWithAuthorKeys.length) {
      return;
    }

    // Remove from the set any existing session keys
    const existingSessionKeys = await prisma.sessionKey.findMany({
      where: {
        recipientDid,
        sessionId: { in: sessionsWithAuthorKeys.map((session) => session.id) },
      },
      select: {
        sessionId: true,
      },
    });

    const sessionKeysNeeded = sessionsWithAuthorKeys.filter(
      (session) =>
        !existingSessionKeys.some(
          (existingSessionKey) => existingSessionKey.sessionId === session.id,
        ),
    );

    const sessionKeyPairIds = sessionKeysNeeded.map(
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
        { ids: sessionKeyPairIds, did: authorDid },
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
        sessionKeysNeeded.map(async (session) => {
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
  };
}
