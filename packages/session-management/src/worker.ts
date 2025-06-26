import { Worker } from '@speakeasy-services/service-base';
import { getServiceJobName, JOB_NAMES } from '@speakeasy-services/queue';
import { SessionPrismaClient } from './session.service.js';
import { recryptDEK } from '@speakeasy-services/crypto';
import { speakeasyApiRequest } from 'packages/common/dist/utils/index.js';

const DAYS = 24 * 60 * 60 * 1000;
const WINDOW_FOR_NEW_TRUSTED_USER = 365 * DAYS;

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

export interface SessionWorkerOptions {
  serviceName: string;
  prisma: SessionPrismaClient;
  port: number;
  healthCheck: () => Promise<void>;
}

/**
 * Session management job handlers that can be attached to any worker
 */
export class SessionJobHandlers {
  private prisma: SessionPrismaClient;
  private serviceName: string;

  constructor(prisma: SessionPrismaClient, serviceName: string) {
    this.prisma = prisma;
    this.serviceName = serviceName;
  }

  /**
   * Attach session management job handlers to a worker
   */
  attachToWorker(worker: Worker): void {
    // Handle update session keys job
    worker.work<UpdateSessionKeysJob>(
      getServiceJobName(this.serviceName, JOB_NAMES.UPDATE_SESSION_KEYS),
      async (job) => {
        const { prevKeyId, newKeyId, prevPrivateKey, newPublicKey } = job.data;
        const BATCH_SIZE = 100;
        let hasMore = true;

        while (hasMore) {
          const sessionKeys = await this.prisma.sessionKey.findMany({
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
              await this.prisma.sessionKey.update({
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

    // Handle add recipient to session job
    worker.work<AddRecipientToSessionJob>(
      getServiceJobName(this.serviceName, JOB_NAMES.ADD_RECIPIENT_TO_SESSION),
      async (job) => {
        worker.logger.info(`Adding recipient to (${this.serviceName}) session`);

        const { authorDid, recipientDid } = job.data;

        // Check if the recipient is still trusted
        const trustedResult = await speakeasyApiRequest(
          {
            method: 'GET',
            path: 'social.spkeasy.graph.getTrusted',
            fromService: this.serviceName,
            toService: 'trusted-users',
          },
          { authorDid, recipientDid },
        );

        if (!trustedResult.trusted.length) {
          return { abortReason: 'Recipient no longer trusted' };
        }

        const sessions = await this.prisma.session.findMany({
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
          worker.logger.error(
            `Some sessions for ${authorDid} do not have author session keys (${sessions.length} sessions, ${sessionsWithAuthorKeys.length})`,
          );
        }

        if (!sessionsWithAuthorKeys.length) {
          return;
        }

        // Remove from the set any existing session keys
        const existingSessionKeys = await this.prisma.sessionKey.findMany({
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
              (existingSessionKey) =>
                existingSessionKey.sessionId === session.id,
            ),
        );

        const sessionKeyPairIds = sessionKeysNeeded.map(
          (session) => session.sessionKeys[0].userKeyPairId,
        );

        // Get the author's private keys and the recipient's public key
        // so we can re-encrypt the DEKs for the new recipient
        const [authorPrivateKeysBody, recipientPublicKeyBody] =
          await Promise.all([
            speakeasyApiRequest(
              {
                method: 'GET',
                path: 'social.spkeasy.key.getPrivateKeys',
                fromService: this.serviceName,
                toService: 'user-keys',
              },
              { ids: sessionKeyPairIds, did: authorDid },
            ),
            // This will trigger a new key if the recipient doesn't have one
            speakeasyApiRequest(
              {
                method: 'GET',
                path: 'social.spkeasy.key.getPublicKey',
                fromService: this.serviceName,
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

        await this.prisma.sessionKey.createMany({
          data: newSessionKeys,
        });
      },
    );

    // Handle revoke session job
    worker.work<RevokeSessionJob>(
      getServiceJobName(this.serviceName, JOB_NAMES.REVOKE_SESSION),
      async (job) => {
        const { authorDid, recipientDid } = job.data;

        // Revoke all active sessions for the author
        await this.prisma.session.updateMany({
          where: {
            authorDid,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { revokedAt: new Date() },
        });

        // If a recipient was specified, delete their session keys
        if (recipientDid) {
          await this.prisma.sessionKey.deleteMany({
            where: {
              session: {
                authorDid,
              },
              recipientDid,
            },
          });
        }
      },
    );

    // Handle delete session keys job
    worker.work<DeleteSessionKeysJob>(
      getServiceJobName(this.serviceName, JOB_NAMES.DELETE_SESSION_KEYS),
      async (job) => {
        const { authorDid, recipientDid } = job.data;

        // Check if the recipient is still trusted
        const trustedResult = await speakeasyApiRequest(
          {
            method: 'GET',
            path: 'social.spkeasy.graph.getTrusted',
            fromService: this.serviceName,
            toService: 'trusted-users',
          },
          { authorDid, recipientDid },
        );

        if (trustedResult.trusted.length) {
          return { abortReason: 'Recipient has been trusted again' };
        }

        await this.prisma.sessionKey.deleteMany({
          where: { recipientDid, session: { authorDid } },
        });
      },
    );
  }
}
