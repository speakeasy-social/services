import PgBoss from 'pg-boss'
import { SessionJobData } from './types'

// Job names as constants to ensure consistency
export const JOB_NAMES = {
  ADD_RECIPIENT_TO_SESSION: 'add-recipient-to-session'
} as const

// Queue singleton to be used across the application
export class Queue {
  private static instance: PgBoss

  private constructor() {}

  static async initialize(connectionString: string): Promise<void> {
    if (!Queue.instance) {
      Queue.instance = new PgBoss(connectionString)
      await Queue.instance.start()
    }
  }

  static getInstance(): PgBoss {
    if (!Queue.instance) {
      throw new Error('Queue not initialized')
    }
    return Queue.instance
  }

  static async shutdown(): Promise<void> {
    if (Queue.instance) {
      await Queue.instance.stop()
    }
  }
}

// Job scheduling function
export async function scheduleAddRecipientToSession(
  authorDid: string,
  recipientDid: string
): Promise<string> {
  const boss = Queue.getInstance()
  return boss.send(JOB_NAMES.ADD_RECIPIENT_TO_SESSION, {
    authorDid,
    recipientDid
  })
}
