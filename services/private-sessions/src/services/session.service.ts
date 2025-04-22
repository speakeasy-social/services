import {
  Prisma,
  PrismaClient,
  Session,
  SessionKey,
  EncryptedPost,
} from '../generated/prisma-client/index.js';
import { encryptSessionKey } from '@speakeasy-services/crypto';
import { NotFoundError, safeAtob } from '@speakeasy-services/common';
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
    }[];
    expirationHours?: number;
  }): Promise<{ sessionId: string }> {
    // open transaction
    const session = await prisma.$transaction(async (tx) => {
      const previousSessions = await tx.$queryRaw<
        Session[]
      >`SELECT * FROM sessions WHERE author_did = ${authorDid} AND revoked_at IS NULL FOR UPDATE`;

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
          previousSessionId: previousSession?.id,
          expiresAt: new Date(Date.now() + expirationHours * 60 * 60 * 1000),

          sessionKeys: {
            create: recipients.map((recipient) => ({
              recipientDid: recipient.recipientDid,
              encryptedDek: Buffer.from(recipient.encryptedDek),
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
    recipientDid: string,
  ): Promise<{ success: boolean }> {
    const session = await prisma.session.findFirst({
      where: { authorDid, revokedAt: null },
      select: { id: true },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    Queue.publish(JOB_NAMES.REVOKE_SESSION, {
      authorDid,
    });

    await prisma.sessionKey.create({
      data: {
        sessionId: session.id,
        recipientDid,
        encryptedDek: Buffer.from(''),
      },
    });

    return { success: true };
  }
}
