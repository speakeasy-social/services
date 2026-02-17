import { Worker } from '@speakeasy-services/service-base';
import { getServiceJobName, JOB_NAMES } from '@speakeasy-services/queue';
import { SessionPrismaClient, SessionKeyModel } from './session.service.js';
import { recryptDEK } from '@speakeasy-services/crypto';
import {
  createAddRecipientToSessionHandler,
  createDeleteSessionKeysHandler,
  createRevokeSessionHandler,
} from './handlers.js';
import type {
  AddRecipientToSessionJob,
  RevokeSessionJob,
  DeleteSessionKeysJob,
} from './handlers.js';
import type { SafeText } from '@speakeasy-services/common';

export interface UpdateSessionKeysJob {
  prevKeyId: string;
  newKeyId: string;
  prevPrivateKey: SafeText;
  newPublicKey: SafeText;
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
          const sessionKeys = (await this.prisma.sessionKey.findMany({
            where: { userKeyPairId: prevKeyId },
            take: BATCH_SIZE,
          })) as SessionKeyModel[];

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

    // Handle add recipient to session job - delegates to shared handler
    worker.work<AddRecipientToSessionJob>(
      getServiceJobName(this.serviceName, JOB_NAMES.ADD_RECIPIENT_TO_SESSION),
      createAddRecipientToSessionHandler(this.prisma, {
        serviceName: this.serviceName,
      }),
    );

    // Handle revoke session job - delegates to shared handler
    worker.work<RevokeSessionJob>(
      getServiceJobName(this.serviceName, JOB_NAMES.REVOKE_SESSION),
      createRevokeSessionHandler(this.prisma),
    );

    // Handle delete session keys job - delegates to shared handler
    worker.work<DeleteSessionKeysJob>(
      getServiceJobName(this.serviceName, JOB_NAMES.DELETE_SESSION_KEYS),
      createDeleteSessionKeysHandler(this.prisma, {
        serviceName: this.serviceName,
      }),
    );
  }
}
