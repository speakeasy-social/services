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

interface GetPostsOptions {
  limit?: number;
  cursor?: string;
  authorDids?: string[];
  replyPostCid?: string;
}

interface GetPostsArgs {
  recipientDid: string;
  options: GetPostsOptions;
}

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
   * Retrieves a post by its URI
   * @param uri - The URI of the post to retrieve
   * @returns Promise containing the post's author DID
   * @throws NotFoundError if the post is not found
   */
  async getPost(uri: string): Promise<{ authorDid: string }> {
    const post = await prisma.encryptedPost.findMany({
      // where: { postId: uri },
      select: { authorDid: true },
    });

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    return post[0];
  }

  /**
   * Creates multiple encrypted posts in a single operation
   * @param authorDid - The DID of the post author
   * @param body - Object containing encrypted posts and session IDs
   * @returns Promise that resolves when all posts are created
   */
  async createEncryptedPosts(
    authorDid: string,
    body: {
      encryptedPosts: {
        cid: string;
        encryptedPost: string;
        reply?: {
          root: string;
          parent: string;
        };
        langs: string[];
        encryptedContent: string;
      }[];
      sessionId: string;
    },
  ): Promise<void> {
    await prisma.encryptedPost.createMany({
      data: body.encryptedPosts.map((post) => ({
        authorDid,
        cid: post.cid,
        sessionId: body.sessionId,
        encryptedContent: safeAtob(post.encryptedContent),
        langs: post.langs,
        replyRoot: post.reply?.root ?? null,
        replyRef: post.reply?.parent ?? null,
      })),
    });
  }

  /**
   * Retrieves posts for a specific recipient with pagination support
   * @param recipientDid - The DID of the recipient
   * @param options - Query options including limit, cursor, and filters
   * @returns Promise containing encrypted posts, session keys, and pagination cursor
   */
  async getPosts(
    recipientDid: string,
    options: GetPostsOptions,
  ): Promise<{
    encryptedPosts: EncryptedPost[];
    encryptedSessionKeys: SessionKey[];
    cursor: string | undefined;
  }> {
    const DEFAULT_LIMIT = 50;

    // Fetch posts from database
    const where: Prisma.EncryptedPostWhereInput = {
      session: {
        sessionKeys: {
          some: {
            recipientDid: recipientDid,
          },
        },
      },
    };

    if (options.authorDids) {
      where.authorDid = { in: options.authorDids };
    }

    if (options.replyPostCid) {
      where.replyRef = options.replyPostCid;
      where.replyRoot = options.replyPostCid;
    }

    if (options.cursor) {
      const decodedCursor = Buffer.from(options.cursor, 'base64').toString(
        'utf-8',
      );
      const [createdAt, cid] = decodedCursor.split('#');
      where.OR = [
        { createdAt: { lt: new Date(createdAt) } },
        {
          AND: [{ createdAt: new Date(createdAt) }, { cid: { lt: cid } }],
        },
      ];
    }

    const posts = await prisma.encryptedPost.findMany({
      where,
      take: options.limit ?? DEFAULT_LIMIT,
      orderBy: {
        createdAt: 'desc',
        // Order by cid when time is the same for predictable
        // pagination
        cid: 'asc',
      },
    });

    // Get the associated session keys for the posts
    const sessionKeys = await prisma.sessionKey.findMany({
      where: {
        sessionId: { in: posts.map((post) => post.sessionId) },
        recipientDid,
      },
    });

    let newCursor;

    if (posts.length > (options.limit ?? DEFAULT_LIMIT)) {
      const lastPost = posts[posts.length - 1];
      // Cursor is base64 encoded string of createdAt and cid
      newCursor = Buffer.from(
        `${lastPost.createdAt.toISOString()}#${lastPost.cid}`,
      ).toString('base64');
    }

    return {
      encryptedPosts: posts,
      encryptedSessionKeys: sessionKeys,
      cursor: newCursor,
    };
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
