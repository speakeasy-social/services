import { PrismaClient } from '@prisma/client'
import { JOB_NAMES } from '@packages/common/src/queue'
import type { AddRecipientToSessionJob } from '@packages/common/src/queue/types'
import { Queue } from '@packages/common/src/queue'
import { addRecipientToSession } from '../sessions'

const prisma = new PrismaClient()

export async function initializeJobHandlers(): Promise<void> {
  const boss = Queue.getInstance()

  // Handler for adding recipient to existing session
  await boss.work(
    JOB_NAMES.ADD_RECIPIENT_TO_SESSION,
    async (job) => {
      const { authorDid, recipientDid } = job.data as AddRecipientToSessionJob

      // Find current valid session
      const currentSession = await prisma.sessions.findFirst({
        where: {
          authorDid,
          revokedAt: null
        }
      })

      if (currentSession) {
        // Add recipient to existing session
        await addRecipientToSession(currentSession.sessionId, recipientDid)
      }
    }
  )
}
