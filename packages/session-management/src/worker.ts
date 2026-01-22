import { SessionPrismaClient } from './session.service.js';
import { recryptDEK } from '@speakeasy-services/crypto';
import { speakeasyApiRequest } from '@speakeasy-services/common';

const DAYS = 24 * 60 * 60 * 1000;
const WINDOW_FOR_NEW_TRUSTED_USER = 730 * DAYS; // 2 years

// Job data interfaces
export interface UpdateSessionKeysJob {
  prevKeyId: string;
  newKeyId: string;
  prevPrivateKey: string;
  newPublicKey: string;
}

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

// Options interfaces
export interface AddRecipientHandlerOptions {
  /**
   * Service name for API calls (e.g., 'private-sessions', 'private-profiles')
   */
  serviceName?: string;
  /**
   * Whether to only grant access to the current (non-revoked) session when adding recipients.
   *
   * - false (default): Grant access to all sessions within the lookback window (for posts,
   *   which are historical - users need to see old posts)
   * - true: Only grant access to the current session (for profiles, which are not historical -
   *   there's only one current profile, so only the current session matters)
   *
   * @default false
   */
  currentSessionOnly?: boolean;
  /**
   * Optional logger for info/error messages
   */
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
}

export interface DeleteSessionKeysHandlerOptions {
  /**
   * Service name for API calls (e.g., 'private-sessions', 'private-profiles')
   */
  serviceName?: string;
}

/**
 * Creates a handler for updating session keys when a user rotates their key pair
 */
export function createUpdateSessionKeysHandler(prisma: SessionPrismaClient) {
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

/**
 * Creates a handler for revoking sessions and optionally deleting recipient keys
 */
export function createRevokeSessionHandler(prisma: SessionPrismaClient) {
  return async (job: { data: RevokeSessionJob }) => {
    const { authorDid, recipientDid } = job.data;

    // Revoke all active sessions for the author
    await prisma.session.updateMany({
      where: {
        authorDid,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });

    // If a recipient was specified, delete their session keys
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

/**
 * Creates a handler for adding a recipient to existing sessions
 */
export function createAddRecipientToSessionHandler(
  prisma: SessionPrismaClient,
  options?: AddRecipientHandlerOptions,
) {
  const serviceName = options?.serviceName ?? 'private-sessions';
  const currentSessionOnly = options?.currentSessionOnly ?? false;
  const logger = options?.logger;

  return async (job: { data: AddRecipientToSessionJob }) => {
    logger?.info(`Adding recipient to (${serviceName}) session`);

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

    // When currentSessionOnly is true (e.g., for profiles), only grant access to
    // the most recent session. Profiles are not historical - there's only one
    // current profile, so only the most recent session matters. We include expired
    // sessions because the profile content may still be valid (e.g., profile created
    // 2 years ago, session expired, but profile hasn't been edited since).
    // For posts (currentSessionOnly=false), grant access to all sessions within
    // the lookback window so users can see historical posts.
    const sessions = await prisma.session.findMany({
      where: {
        authorDid,
        ...(!currentSessionOnly && {
          createdAt: {
            gt: new Date(Date.now() - WINDOW_FOR_NEW_TRUSTED_USER),
          },
        }),
      },
      include: {
        sessionKeys: {
          where: {
            recipientDid: authorDid,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...(currentSessionOnly && { take: 1 }),
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
      logger?.error(
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
        sessionId: {
          in: sessionsWithAuthorKeys.map((session) => session.id),
        },
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
          fromService: serviceName,
          toService: 'user-keys',
        },
        { ids: sessionKeyPairIds, did: authorDid },
      ),
      // This will trigger a new key if the recipient doesn't have one
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

/**
 * Creates a handler for deleting session keys when a user is removed from trusted
 */
export function createDeleteSessionKeysHandler(
  prisma: SessionPrismaClient,
  options?: DeleteSessionKeysHandlerOptions,
) {
  const serviceName = options?.serviceName ?? 'private-sessions';

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
