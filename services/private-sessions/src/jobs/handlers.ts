import { PrismaClient } from '../generated/prisma-client/index.js';
import { JOB_NAMES, Queue } from '@speakeasy-services/queue';
import type {
  AddRecipientToSessionJob,
  Job,
} from '@speakeasy-services/queue/types';
import { addRecipientToSession } from '../services/session.service.js';

const prisma = new PrismaClient();

export async function initializeJobHandlers(): Promise<void> {
  const boss = Queue.getInstance();

  // Handler for adding recipient to existing session
  await boss.work(
    JOB_NAMES.ADD_RECIPIENT_TO_SESSION,
    async (job: Job<AddRecipientToSessionJob>) => {
      const { authorDid, recipientDid } = job.data;

      // Find current valid session
      const currentSession = await prisma.session.findFirst({
        where: {
          authorDid,
          revokedAt: null,
        },
      });

      if (currentSession) {
        // Add recipient to existing session
        await addRecipientToSession(currentSession.id, recipientDid);
      }
    },
  );
}
