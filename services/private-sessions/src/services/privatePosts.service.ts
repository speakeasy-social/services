import {
  Prisma,
  PrismaClient,
  SessionKey,
  EncryptedPost,
} from '../generated/prisma-client/index.js';
import { NotFoundError, safeAtob } from '@speakeasy-services/common';

const prisma = new PrismaClient();

interface GetPostsOptions {
  limit?: number;
  cursor?: string;
  authorDids?: string[];
  replyPostCid?: string;
}

export class PrivatePostsService {
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
}
