import { Worker } from '@speakeasy-services/service-base';
import { getServiceJobName, JOB_NAMES } from '@speakeasy-services/queue';
import { Job } from '@speakeasy-services/queue/types';
import { SessionPrismaClient } from './session.service.js';
import { recryptDEK } from '@speakeasy-services/crypto';

export interface UpdateSessionKeysJob {
  prevKeyId: string;
  newKeyId: string;
  prevPrivateKey: string;
  newPublicKey: string;
}

export interface SessionWorkerOptions {
  serviceName: string;
  prisma: SessionPrismaClient;
  port: number;
  healthCheck: () => Promise<void>;
}

export class SessionWorker {
  private worker: Worker;
  private serviceName: string;
  private prisma: SessionPrismaClient;

  constructor(options: SessionWorkerOptions) {
    this.serviceName = options.serviceName;
    this.prisma = options.prisma;

    this.worker = new Worker({
      name: `${options.serviceName}-worker`,
      healthCheck: options.healthCheck,
      port: options.port,
    });

    this.setupWorkers();
  }

  private setupWorkers(): void {
    // Handle update session keys job
    this.worker.work<UpdateSessionKeysJob>(
      getServiceJobName(this.serviceName, JOB_NAMES.UPDATE_SESSION_KEYS),
      async (job: Job<UpdateSessionKeysJob>) => {
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
  }

  async start(): Promise<void> {
    await this.worker.start();
  }

  async stop(): Promise<void> {
    await this.worker.stop();
  }
}
