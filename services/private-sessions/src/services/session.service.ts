import {
  Prisma,
  PrismaClient,
  Session,
  SessionKey,
  EncryptedPost,
} from '../generated/prisma-client/index.js';
import {
  decryptSessionKey,
  encryptSessionKey,
} from '@speakeasy-services/crypto';
import {
  NotFoundError,
  ValidationError,
  safeAtob,
  safeBtoa,
} from '@speakeasy-services/common';
import { Queue } from 'packages/queue/dist/index.js';
import { JOB_NAMES } from 'packages/queue/dist/index.js';

const prisma = new PrismaClient();

// 7 days
const DEFAULT_SESSION_EXPIRATION_HOURS = 24 * 7;

export class SessionService {
  /**
   * Creates a new session for an author with specified recipients
   * @param authorDid - The DID of the author creating the session
   * @param recipients - Array of recipients with their encrypted DEKs
   * @returns Promise containing the newly created session ID
   */
  async createSession({
    authorDid,
    recipients,
    expirationHours = DEFAULT_SESSION_EXPIRATION_HOURS,
  }: {
    authorDid: string;
    recipients: {
      recipientDid: string;
      encryptedDek: string;
      userKeyPairId: string;
    }[];
    expirationHours?: number;
  }): Promise<{ sessionId: string }> {
    const ownSessionKey = recipients.find(
      (recipient) => recipient.recipientDid === authorDid,
    );
    if (!ownSessionKey) {
      throw new ValidationError(
        `Session author must be among recipients or they won't be able to read their own posts!`,
      );
    }

    // open transaction
    const session = await prisma.$transaction(async (tx) => {
      const previousSessions = await tx.$queryRaw<
        Session[]
      >`SELECT * FROM sessions WHERE "authorDid" = ${authorDid} AND "revokedAt" IS NULL FOR UPDATE`;

      const previousSession = previousSessions[0];

      if (previousSession) {
        // revoke session if one already exists
        await tx.session.updateMany({
          where: {
            authorDid,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      }

      // Create new session
      const session = await tx.session.create({
        data: {
          authorDid,
          expiresAt: new Date(Date.now() + expirationHours * 60 * 60 * 1000),

          sessionKeys: {
            create: recipients.map((recipient) => ({
              userKeyPairId: recipient.userKeyPairId,
              recipientDid: recipient.recipientDid,
              encryptedDek: safeAtob(recipient.encryptedDek),
            })),
          },
        },
      });

      return session;
    });

    return { sessionId: session.id };
  }

  /**
   * Retrieves a session by its ID
   * @param sessionId - The ID of the session to retrieve
   * @returns Promise containing the session details
   */
  async getSession(authorDid: string): Promise<SessionKey> {
    // Fetch session key from database
    const sessionKey = await prisma.sessionKey.findFirst({
      where: {
        recipientDid: authorDid,
        session: {
          authorDid,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
      },
    });

    if (!sessionKey) {
      throw new NotFoundError('Session not found');
    }

    return sessionKey;
  }

  /**
   * Revokes a session for a specific author
   * @param authorDid - The DID of the author whose session should be revoked
   * @returns Promise containing success status
   */
  async revokeSession(authorDid: string): Promise<{ success: boolean }> {
    await prisma.session.updateMany({
      where: { authorDid, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  /**
   * Adds a new recipient to an existing session
   * @param authorDid - The DID of the session author
   * @param recipientDid - The DID of the recipient to add
   * @returns Promise containing success status
   */
  async addRecipientToSession(
    authorDid: string,
    body: {
      recipientDid: string;
      encryptedDek: string;
      userKeyPairId: string;
    },
  ): Promise<{ success: boolean }> {
    const session = await prisma.session.findFirst({
      where: { authorDid, revokedAt: null },
      select: { id: true },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    await prisma.sessionKey.create({
      data: {
        sessionId: session!.id,
        recipientDid: body.recipientDid,
        encryptedDek: Buffer.from(body.encryptedDek),
        userKeyPairId: body.userKeyPairId,
      },
    });

    return { success: true };
  }

  /**
   * Updates session keys for a batch of sessions by re-encrypting the data encryption keys (DEKs)
   * with a new public key. This is typically used when rotating or updating encryption keys.
   *
   * Keys are updated in batches and the reference to userKeyPairId means we can pick up where
   * we left off if the work is interrupted for any reason
   *
   * @param body - Object containing key update parameters
   * @param body.prevKeyId - The ID of the previous key pair
   * @param body.newKeyId - The ID of the new key pair
   * @param body.prevPrivateKey - The private key from the previous key pair, used to decrypt existing DEKs
   * @param body.newPublicKey - The public key from the new key pair, used to re-encrypt the DEKs
   */
  async updateSessionKeys(body: {
    prevKeyId: string;
    newKeyId: string;
    prevPrivateKey: string;
    newPublicKey: string;
  }): Promise<void> {
    const BATCH_SIZE = 100;
    let hasMore = true;

    while (hasMore) {
      const sessionKeys = await prisma.sessionKey.findMany({
        where: { userKeyPairId: body.prevKeyId },
        take: BATCH_SIZE,
      });

      if (sessionKeys.length === 0) {
        hasMore = false;
        continue;
      }

      await Promise.all(
        sessionKeys.map(async (sessionKey) => {
          const rawDek = await decryptSessionKey(
            safeBtoa(sessionKey.encryptedDek),
            body.prevPrivateKey,
          );
          const newEncryptedDek = await encryptSessionKey(
            rawDek,
            body.newPublicKey,
          );
          await prisma.sessionKey.update({
            where: {
              sessionId_recipientDid: {
                sessionId: sessionKey.sessionId,
                recipientDid: sessionKey.recipientDid,
              },
            },
            data: {
              userKeyPairId: body.newKeyId,
              encryptedDek: safeAtob(newEncryptedDek),
            },
          });
        }),
      );
    }
  }
}
