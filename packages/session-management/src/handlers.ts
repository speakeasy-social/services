import { speakeasyApiRequest } from '@speakeasy-services/common';
import { recryptDEK } from '@speakeasy-services/crypto';
import type {
  SessionPrismaClient,
  SessionKeyModel,
  SessionModel,
} from './session.service.js';

// Type for session with sessionKeys included
interface SessionWithKeys extends SessionModel {
  sessionKeys: SessionKeyModel[];
}

// Job types
export interface AddRecipientToSessionJob {
  authorDid: string;
  recipientDid: string;
}

export interface RevokeSessionJob {
  authorDid: string;
  recipientDid?: string;
}

export interface DeleteSessionKeysJob {
  authorDid: string;
  recipientDid: string;
}

// Options types
export interface AddRecipientToSessionOptions {
  serviceName: string;
  currentSessionOnly?: boolean;
}

export interface DeleteSessionKeysOptions {
  serviceName: string;
}

const DAYS = 24 * 60 * 60 * 1000;
const WINDOW_FOR_NEW_TRUSTED_USER = 730 * DAYS;

/**
 * Creates a handler that adds a new recipient to existing sessions.
 * When a user becomes trusted, this retroactively encrypts session keys
 * so they can decrypt the author's content.
 */
export function createAddRecipientToSessionHandler(
  prisma: SessionPrismaClient,
  options: AddRecipientToSessionOptions,
) {
  const { serviceName, currentSessionOnly = false } = options;

  return async (job: { data: AddRecipientToSessionJob }) => {
    const { authorDid, recipientDid } = job.data;

    // Check if the recipient is still trusted
    const trustedResult = await speakeasyApiRequest(
      {
        method: 'GET',
        path: 'social.spkeasy.graph.getTrusted',
        fromService: serviceName,
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
        createdAt: {
          gt: new Date(Date.now() - WINDOW_FOR_NEW_TRUSTED_USER),
        },
      },
      include: {
        sessionKeys: {
          where: {
            recipientDid: authorDid,
          },
        },
      },
      ...(currentSessionOnly && {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      }),
    });

    const sessionsWithAuthorKeys = sessions.filter(
      (session): session is SessionWithKeys =>
        !!session.sessionKeys && session.sessionKeys.length > 0,
    );

    if (sessionsWithAuthorKeys.length === 0) {
      return;
    }

    const sessionsToProcess = sessionsWithAuthorKeys;

    // Remove from the set any existing session keys
    const existingSessionKeys = (await prisma.sessionKey.findMany({
      where: {
        recipientDid,
        sessionId: {
          in: sessionsToProcess.map((session) => session.id),
        },
      },
      select: {
        sessionId: true,
      },
    })) as { sessionId: string }[];

    const sessionKeysNeeded = sessionsToProcess.filter(
      (session) =>
        !existingSessionKeys.some(
          (existing) => existing.sessionId === session.id,
        ),
    );

    if (sessionKeysNeeded.length === 0) {
      return;
    }

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
          fromService: serviceName,
          toService: 'user-keys',
        },
        { ids: sessionKeyPairIds, did: authorDid },
      ),
      speakeasyApiRequest(
        {
          method: 'GET',
          path: 'social.spkeasy.key.getPublicKey',
          fromService: serviceName,
          toService: 'user-keys',
        },
        { did: recipientDid },
      ),
    ]);

    const authorPrivateKeys: {
      userKeyPairId: string;
      privateKey: string;
    }[] = authorPrivateKeysBody.keys;

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

/**
 * Creates a handler that deletes session keys for a recipient
 * who has been untrusted. Checks if the recipient was re-trusted
 * before deleting to avoid race conditions.
 */
export function createDeleteSessionKeysHandler(
  prisma: SessionPrismaClient,
  options: DeleteSessionKeysOptions,
) {
  const { serviceName } = options;

  return async (job: { data: DeleteSessionKeysJob }) => {
    const { authorDid, recipientDid } = job.data;

    // Check if the recipient is still trusted
    const trustedResult = await speakeasyApiRequest(
      {
        method: 'GET',
        path: 'social.spkeasy.graph.getTrusted',
        fromService: serviceName,
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

/**
 * Creates a handler that revokes all active sessions for an author.
 * If a recipientDid is specified, also deletes that recipient's session keys.
 */
export function createRevokeSessionHandler(prisma: SessionPrismaClient) {
  return async (job: { data: RevokeSessionJob }) => {
    const { authorDid, recipientDid } = job.data;

    await prisma.session.updateMany({
      where: { authorDid, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });

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
