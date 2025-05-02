import {
  Prisma,
  PrismaClient,
  SessionKey,
  EncryptedPost,
} from '../generated/prisma-client/index.js';
import {
  ExtendedRequest,
  NotFoundError,
  User,
  ValidationError,
  createCursorWhereClause,
  decodeCursor,
  encodeCursor,
  fetchFollowingDids,
  safeAtob,
} from '@speakeasy-services/common';
import { getPrismaClient } from '../db.js';

const prisma = getPrismaClient();

interface GetPostsOptions {
  limit?: number;
  cursor?: string;
  authorDids?: string[];
  uris?: string[];
  replyTo?: string;
  filter?: string;
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
      where: { uri },
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
        uri: string;
        rkey: string;
        encryptedPost: string;
        reply?: {
          root: { uri: string };
          parent: { uri: string };
        };
        langs: string[];
        encryptedContent: string;
        media: { id: string }[];
      }[];
      sessionId: string;
    },
  ): Promise<void> {
    // Collect all requested media IDs
    const requestedMediaIds = body.encryptedPosts.flatMap((post) =>
      post.media.map((m) => m.id),
    );

    const media = await prisma.media.findMany({
      where: {
        id: {
          in: requestedMediaIds,
        },
      },
    });

    // Get the IDs of the media that were found
    const foundMediaIds = media.map((m) => m.id);
    // Find missing media IDs
    const missingMediaIds = requestedMediaIds.filter(
      (id) => !foundMediaIds.includes(id),
    );

    // Ensure all the media ids exist
    if (missingMediaIds.length > 0) {
      throw new ValidationError(`Some media for the post was not uploaded`, {
        details: { missingMediaIds },
      });
    }

    await prisma.encryptedPost.createMany({
      data: body.encryptedPosts.map((post) => {
        if (
          post.uri !==
          `at://${authorDid}/social.spkeasy.feed.privatePost/${post.rkey}`
        ) {
          throw new ValidationError(`Invalid URI for post ${post.uri}`);
        }
        return {
          authorDid,
          uri: post.uri,
          rkey: post.rkey,
          sessionId: body.sessionId,
          encryptedContent: safeAtob(post.encryptedContent),
          // encryptedContent: Buffer.from(post.encryptedContent),
          langs: post.langs,
          replyRootUri: post.reply?.root?.uri ?? null,
          replyUri: post.reply?.parent?.uri ?? null,
        };
      }),
    });

    await prisma.mediaPost.createMany({
      data: body.encryptedPosts.flatMap((post) =>
        post.media.map((m) => ({
          mediaId: m.id,
          encryptedPostUri: post.uri,
        })),
      ),
    });
  }

  /**
   * Retrieves posts for a specific recipient with pagination support
   * @param recipientDid - The DID of the recipient
   * @param options - Query options including limit, cursor, and filters
   * @returns Promise containing encrypted posts, session keys, and pagination cursor
   */
  async getPosts(
    req: ExtendedRequest,
    recipientDid: string,
    options: GetPostsOptions,
  ): Promise<{
    encryptedPosts: EncryptedPost[];
    encryptedSessionKeys: SessionKey[];
    cursor?: string;
  }> {
    const DEFAULT_LIMIT = 50;

    if (options.filter === 'follows') {
      let followingDids;
      if (req.prefetch?.followingDidsPromise) {
        followingDids = await req.prefetch.followingDidsPromise;
      }
      if (!followingDids) {
        followingDids = await fetchFollowingDids(
          req,
          (req.user as User).token as string,
          recipientDid,
        );
      }
      // Merge options.authorDids with followingDids
      options.authorDids = [...(options.authorDids || []), ...followingDids];
    }
    // Fetch posts from database
    const where: Prisma.EncryptedPostWhereInput = {
      session: {
        sessionKeys: {
          some: {
            recipientDid: recipientDid,
          },
        },
      },
      ...createCursorWhereClause(options.cursor),
    };

    if (options.authorDids) {
      where.authorDid = { in: options.authorDids };
    }

    if (options.uris) {
      where.uri = { in: options.uris };
    }

    if (options.replyTo) {
      where.OR = [
        { replyUri: options.replyTo },
        { replyRootUri: options.replyTo },
      ];
    }

    const posts = await prisma.encryptedPost.findMany({
      where,
      take: options.limit ?? DEFAULT_LIMIT,
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          // Order by rkey when time is the same for predictable
          // pagination
          rkey: 'asc',
        },
      ],
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
      // Cursor is base64 encoded string of createdAt and rkey
      newCursor = encodeCursor(lastPost);
    }

    return {
      encryptedPosts: posts,
      encryptedSessionKeys: sessionKeys,
      cursor: newCursor,
    };
  }
}
