import {
  PrismaClient,
  Session,
  SessionKey,
  EncryptedPost,
} from '../generated/prisma-client/index.js';
import { encryptSessionKey } from '@speakeasy-services/crypto';
import { NotFoundError } from '@speakeasy-services/common';
import { Queue } from 'packages/queue/dist/index.js';
import { JOB_NAMES } from 'packages/queue/dist/index.js';

const prisma = new PrismaClient();

interface GetPostsOptions {
  limit?: number;
  cursor?: string;
  authorDid?: string;
  replyPostCid?: string;
}

interface GetPostsArgs {
  recipientDid: string;
  options: GetPostsOptions;
}

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
  }: {
    authorDid: string;
    recipients: {
      recipientDid: string;
      encryptedDek: string;
    }[];
  }): Promise<{ sessionId: string }> {
    // open transaction
    const session = await prisma.$transaction(async (tx) => {
      const previousSessions = await tx.$queryRaw<
        Session[]
      >`SELECT * FROM sessions WHERE author_did = ${authorDid} AND revoked_at IS NULL AND expires_at > NOW() FOR UPDATE`;

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
    const post = await prisma.encryptedPost.findUnique({
      where: { postId: uri },
      select: { authorDid: true },
    });

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    return post;
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
      sessionId: string[];
    },
  ): Promise<void> {
    await prisma.encryptedPost.createMany({
      data: body.encryptedPosts.map((post) => ({
        authorDid,
        cid: post.cid,
        sessionId: body.sessionId,
        encryptedContent: Buffer.from(post.encryptedContent),
        langs: post.langs,
        replyRoot: post.reply?.root,
        replyRef: post.reply?.parent,
      })),
    });
  }

  /**
   * Retrieves multiple posts by their IDs
   * @param postIds - Array of post IDs to retrieve
   * @returns Promise containing array of posts with their author DIDs
   * @throws NotFoundError if any post is not found
   */
  async getPostsByIds(
    postIds: string[],
  ): Promise<Array<{ authorDid: string }>> {
    const posts = await prisma.encryptedPost.findMany({
      where: { postId: { in: postIds } },
      select: { authorDid: true },
    });

    if (posts.length !== postIds.length) {
      throw new NotFoundError('One or more posts not found');
    }

    return posts;
  }

  /**
   * Retrieves posts for a specific recipient with pagination support
   * @param recipientDid - The DID of the recipient
   * @param options - Query options including limit, cursor, and filters
   * @returns Promise containing encrypted posts, session keys, and pagination cursor
   */
  async getPosts({
    recipientDid,
    options: { limit = 50, cursor, authorDids, replyPostCid },
  }: GetPostsArgs): Promise<{
    encryptedPosts: EncryptedPost[];
    encryptedSessionKeys: SessionKey[];
    cursor: string | undefined;
  }> {
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

    if (authorDids) {
      where.authorDid = { in: authorDids };
    }

    if (replyPostCid) {
      where.replyRef = replyPostCid;
      where.replyRoot = replyPostCid;
    }

    if (cursor) {
      const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
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
      take: limit,
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

    if (posts.length > limit) {
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
    await prisma.session.update({
      where: { authorDid, revokedAt: null },
      data: { revokedAt: new Date() },
      select: { id: true },
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
    const session = await prisma.session.findUnique({
      where: { authorDid, revokedAt: null },
      select: { id: true },
    });

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
