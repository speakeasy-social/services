import { NotFoundError, ValidationError } from '@speakeasy-services/common';
import { safeAtob } from '@speakeasy-services/common';
import { Queue, getServiceJobName, JOB_NAMES } from '@speakeasy-services/queue';

const DEFAULT_EXPIRATION_HOURS = 24 * 7;

// Define the shape of session models
export interface SessionModel {
  id: string;
  authorDid: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
}

export interface SessionKeyModel {
  sessionId: string;
  userKeyPairId: string;
  recipientDid: string;
  encryptedDek: Uint8Array;
  createdAt: Date;
}

// Define session with session keys included
export interface SessionWithKeysModel extends SessionModel {
  sessionKeys: SessionKeyModel[];
}

// Define session key with session included
export interface SessionKeyWithSessionModel extends SessionKeyModel {
  session?: SessionModel;
}

// Define the minimum interface required for session operations
export interface SessionPrismaClient<
  T extends SessionModel = SessionModel,
  K extends SessionKeyModel = SessionKeyModel,
> {
  session: {
    create: (args: { data: any }) => Promise<T>;
    updateMany: (args: { where: any; data: any }) => Promise<any>;
    findFirst: (args: {
      where: any;
      orderBy?: any;
      select?: any;
    }) => Promise<T | null>;
    findMany: (args: {
      where: any;
      include?: any;
      take?: number;
    }) => Promise<SessionWithKeysModel[]>;
    deleteMany: (args: { where: any }) => Promise<any>;
  };
  sessionKey: {
    findFirst: (args: {
      where: any;
      include?: any;
    }) => Promise<(K & { session?: T }) | null>;
    findMany: (args: {
      where: any;
      include?: any;
      take?: number;
      select?: any;
    }) => Promise<K[]>;
    create: (args: { data: any }) => Promise<K>;
    createMany: (args: { data: any[] }) => Promise<any>;
    update: (args: { where: any; data: any }) => Promise<K>;
    deleteMany: (args: { where: any }) => Promise<any>;
  };
  $transaction: <R>(
    fn: (tx: SessionPrismaClient<T, K>) => Promise<R>,
  ) => Promise<R>;
  $queryRaw: <R>(query: any) => Promise<R[]>;
  $queryRawUnsafe: <R>(query: string, ...values: any[]) => Promise<R[]>;
}

// Define the SessionKey type for the shared service
export interface SessionKey {
  recipientDid: string;
  userKeyPairId: string;
  encryptedDek: string;
}

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
  prevKeyId: string;
  newKeyId: string;
  prevPrivateKey: string;
  newPublicKey: string;
}

export class SessionService<
  T extends SessionModel = SessionModel,
  K extends SessionKeyModel = SessionKeyModel,
> {
  private prisma: SessionPrismaClient<T, K>;
  private serviceName: string;
  private sessionTableName: string;

  constructor(
    prisma: SessionPrismaClient<T, K>,
    serviceName: string,
    options?: { sessionTableName?: string },
  ) {
    this.prisma = prisma;
    this.serviceName = serviceName;
    this.sessionTableName = options?.sessionTableName ?? 'sessions';
  }

  /**
   * Creates a new session with the specified session keys
   * @param params - The parameters for creating a session
   * @returns The created session
   */
  async createSession(params: CreateSessionParams) {
    const {
      authorDid,
      recipients,
      expirationHours = DEFAULT_EXPIRATION_HOURS,
    } = params;

    // Dedupe recipients by recipientDid, keeping first occurrence
    const seen = new Set<string>();
    const uniqueRecipients = recipients.filter((recipient) => {
      if (seen.has(recipient.recipientDid)) return false;
      seen.add(recipient.recipientDid);
      return true;
    });

    const ownSessionKey = uniqueRecipients.find(
      (recipient) => recipient.recipientDid === authorDid,
    );
    if (!ownSessionKey) {
      throw new ValidationError(
        `Session author must be among recipients or they won't be able to read their own posts!`,
      );
    }

    // open transaction
    const session = await this.prisma.$transaction(async (tx) => {
      const previousSessions = (await tx.$queryRawUnsafe(
        `SELECT * FROM ${this.sessionTableName} WHERE "authorDid" = $1 AND "revokedAt" IS NULL FOR UPDATE`,
        authorDid,
      )) as T[];

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
            create: uniqueRecipients.map((recipient) => ({
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
   * Revokes a session for a specific author
   * @param authorDid - The DID of the author whose session to revoke
   */
  async revokeSession(authorDid: string) {
    await this.prisma.session.updateMany({
      where: { authorDid, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  /**
   * Gets the current session for a user
   * @param did - The DID of the user
   * @returns The current session key for the user
   */
  async getSession(authorDid: string) {
    const sessionKey = await this.prisma.sessionKey.findFirst({
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
      include: {
        session: true,
      },
    });

    if (!sessionKey) {
      throw new NotFoundError('Session not found');
    }

    return sessionKey;
  }

  /**
   * Adds a new recipient to an existing session
   * @param authorDid - The DID of the session author
   * @param params - The parameters for adding a recipient
   */
  async addRecipientToSession(
    authorDid: string,
    body: {
      recipientDid: string;
      encryptedDek: string;
      userKeyPairId: string;
    },
  ): Promise<{ success: boolean }> {
    const session = await this.prisma.session.findFirst({
      where: { authorDid, revokedAt: null },
      select: { id: true },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    await this.prisma.sessionKey.create({
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
   * Queues a background job to update the session keys for a session
   * @param params - The parameters for updating session keys
   */
  async updateSessionKeys(params: UpdateSessionKeysParams): Promise<void> {
    const jobName = getServiceJobName(
      this.serviceName,
      JOB_NAMES.UPDATE_SESSION_KEYS,
    );

    await Queue.publish(jobName, params);
  }
}
