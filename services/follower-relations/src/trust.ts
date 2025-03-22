import { PrismaClient, Prisma } from '@prisma/client'
import { scheduleAddRecipientToSession } from '@packages/common/src/queue'

const prisma = new PrismaClient()

/**
 * Add a new trusted user relationship and schedule session key generation
 */
export async function addTrustedUser(authorDid: string, recipientDid: string): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Check if relationship already exists
    const existingRelation = await tx.trustedUsers.findFirst({
      where: {
        authorDid,
        recipientDid,
        deletedAt: null
      }
    })

    if (existingRelation) {
      throw new Error('Trust relationship already exists')
    }

    // Create trust relationship
    await tx.trustedUsers.create({
      data: {
        authorDid,
        recipientDid,
        createdAt: new Date()
      }
    })
  })

  // Schedule session update after transaction completes
  await scheduleAddRecipientToSession(authorDid, recipientDid)
}

/**
 * Remove a trusted user relationship and revoke their session access
 */
export async function removeTrustedUser(authorDid: string, recipientDid: string): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Find and mark existing relationship as deleted
    const existingRelation = await tx.trustedUsers.findFirst({
      where: {
        authorDid,
        recipientDid,
        deletedAt: null
      }
    })

    if (!existingRelation) {
      throw new Error('Trust relationship does not exist')
    }

    // Mark relationship as deleted
    await tx.trustedUsers.update({
      where: {
        authorDid_recipientDid_createdAt: {
          authorDid,
          recipientDid,
          createdAt: existingRelation.createdAt
        }
      },
      data: {
        deletedAt: new Date()
      }
    })

    // Revoke sessions where this was the only recipient
    await tx.sessions.updateMany({
      where: {
        authorDid,
        revokedAt: null,
        sessionKeys: {
          some: { recipientDid },
          // Check if this is the only recipient
          every: { recipientDid }
        }
      },
      data: {
        revokedAt: new Date()
      }
    })

    // Remove all session keys for this recipient
    await tx.sessionKeys.deleteMany({
      where: {
        recipientDid,
        session: {
          authorDid,
          revokedAt: null
        }
      }
    })
  })
}

/**
 * Get all current trusted recipients for an author
 */
export async function getTrustedRecipients(authorDid: string): Promise<string[]> {
  const relations = await prisma.trustedUsers.findMany({
    where: {
      authorDid,
      deletedAt: null
    },
    select: {
      recipientDid: true
    }
  })

  return relations.map(r => r.recipientDid)
}
