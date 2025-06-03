import { PrismaClient } from '@prisma/client';
import { SessionKey } from '@speakeasy-services/common';

export interface CreateSessionParams {
  authorDid: string;
  recipients: SessionKey[];
  expirationHours?: number;
}

export interface AddRecipientParams {
  authorDid: string;
  recipientDid: string;
  encryptedSessionKey: string;
}

export interface UpdateSessionKeysParams {
  authorDid: string;
  recipients: SessionKey[];
}

export class SessionService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Creates a new session with the specified session keys
   * @param params - The parameters for creating a session
   * @returns The created session
   */
  async createSession(params: CreateSessionParams) {
    const { authorDid, recipients, expirationHours = 24 } = params;

    // Create the session
    const session = await this.prisma.session.create({
      data: {
        authorDid,
        expirationHours,
        sessionKeys: {
          create: recipients.map((recipient) => ({
            recipientDid: recipient.recipientDid,
            encryptedSessionKey: recipient.encryptedSessionKey,
          })),
        },
      },
      include: {
        sessionKeys: true,
      },
    });

    return session;
  }

  /**
   * Revokes a session for a specific author
   * @param authorDid - The DID of the author whose session to revoke
   */
  async revokeSession(authorDid: string) {
    await this.prisma.session.deleteMany({
      where: {
        authorDid,
      },
    });
  }

  /**
   * Gets the current session for a user
   * @param did - The DID of the user
   * @returns The current session key for the user
   */
  async getSession(did: string) {
    const sessionKey = await this.prisma.sessionKey.findFirst({
      where: {
        recipientDid: did,
        session: {
          authorDid: did,
        },
      },
      include: {
        session: true,
      },
    });

    if (!sessionKey) {
      throw new Error('No session found for user');
    }

    return sessionKey;
  }

  /**
   * Adds a new recipient to an existing session
   * @param authorDid - The DID of the session author
   * @param params - The parameters for adding a recipient
   */
  async addRecipientToSession(authorDid: string, params: AddRecipientParams) {
    const { recipientDid, encryptedSessionKey } = params;

    // Get the most recent session for the author
    const session = await this.prisma.session.findFirst({
      where: {
        authorDid,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!session) {
      throw new Error('No session found for author');
    }

    // Add the new recipient
    await this.prisma.sessionKey.create({
      data: {
        sessionId: session.id,
        recipientDid,
        encryptedSessionKey,
      },
    });
  }

  /**
   * Updates the session keys for a session
   * @param params - The parameters for updating session keys
   */
  async updateSessionKeys(params: UpdateSessionKeysParams) {
    const { authorDid, recipients } = params;

    // Get the most recent session for the author
    const session = await this.prisma.session.findFirst({
      where: {
        authorDid,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!session) {
      throw new Error('No session found for author');
    }

    // Delete existing session keys
    await this.prisma.sessionKey.deleteMany({
      where: {
        sessionId: session.id,
      },
    });

    // Create new session keys
    await this.prisma.sessionKey.createMany({
      data: recipients.map((recipient) => ({
        sessionId: session.id,
        recipientDid: recipient.recipientDid,
        encryptedSessionKey: recipient.encryptedSessionKey,
      })),
    });
  }
}
