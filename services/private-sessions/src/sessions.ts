import { PrismaClient, Prisma } from '@prisma/client'
import { encryptSessionKey } from '@packages/crypto/src/kyber'

const prisma = new PrismaClient()

/**
 * Add a recipient to an existing session by generating and encrypting a new session key
 */
export async function addRecipientToSession(sessionId: string, recipientDid: string): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Get the session and recipient's public key
    const [session, recipientKey] = await Promise.all([
      tx.sessions.findUnique({
        where: { id: sessionId },
        include: { staffKey: true }
      }),
      tx.userKey.findUnique({
        where: { did: recipientDid },
        select: { publicKey: true }
      })
    ])

    if (!session || !recipientKey) {
      throw new Error('Session or recipient not found')
    }

    if (session.revokedAt) {
      throw new Error('Session is revoked')
    }

    // Generate and encrypt a new session key for the recipient
    const encryptedDek = await encryptSessionKey(
      recipientKey.publicKey,
      session.staffKey?.dek
    )

    // Add the recipient's session key
    await tx.sessionKey.create({
      data: {
        sessionId,
        recipientDid,
        encryptedDek
      }
    })
  })
}
