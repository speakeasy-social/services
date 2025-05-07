import {
  Prisma,
  SessionKey,
  EncryptedPost,
} from '../generated/prisma-client/index.js';
import {
  ExtendedRequest,
  NotFoundError,
  User,
  ValidationError,
  createCursorWhereClause,
  encodeCursor,
  fetchBlueskyPosts,
  fetchBlueskyProfile,
  fetchFollowingDids,
  getHostFromToken,
  safeAtob,
} from '@speakeasy-services/common';
import { getPrismaClient } from '../db.js';
import { Queue } from 'packages/queue/dist/index.js';
import { JOB_NAMES } from 'packages/queue/dist/index.js';

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
    authorHandle: string,
    token: string,
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

    await prisma.$transaction(async (tx) => {
      // Cache the author handle
      await tx.userDidCache.upsert({
        where: { handle: authorHandle },
        update: { userDid: authorDid },
        create: { handle: authorHandle, userDid: authorDid },
      });

      await tx.encryptedPost.createMany({
        data: body.encryptedPosts.map((post) => {
          const allowedPostFormats = [
            `at://${authorDid}/social.spkeasy.feed.privatePost/${post.rkey}`,
            `at://${authorDid}/social.spkeasy.feed.repost/${post.rkey}`,
          ];

          if (!allowedPostFormats.includes(post.uri)) {
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
    });

    // Cache the reply handles
    const replyUris = body.encryptedPosts
      .map((post) => post.reply?.parent?.uri ?? null)
      .filter(Boolean);
    const replyRootUris = body.encryptedPosts
      .map((post) => post.reply?.root?.uri ?? null)
      .filter(Boolean);
    const allReplyUris = [...replyUris, ...replyRootUris];

    const allReplyDids = allReplyUris
      .map((uri) => {
        const match = uri!.match(/at:\/\/([^/]+)\/[^?]+/);
        return match ? match[1] : null;
      })
      // We already know the author did, so no need to look
      // that up
      .filter((did) => did !== authorDid);

    if (allReplyDids.length) {
      await Queue.publish(JOB_NAMES.POPULATE_DID_CACHE, {
        dids: allReplyDids,
        host: getHostFromToken(token),
      });
    }
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
    const token = (req.user as User).token as string;

    let promises: Promise<void>[] = [];

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
      promises.push(
        // Resolve handle uris to dids
        canonicalUris(options.uris, token, false).then((uris) => {
          where.uri = { in: uris };
        }),
      );
    }

    if (options.replyTo) {
      promises.push(
        // Resolve handle uris to dids
        canonicalUris([options.replyTo], token as string, true).then((uris) => {
          where.OR = [{ replyUri: uris[0] }, { replyRootUri: uris[0] }];
        }),
      );
    }

    await Promise.all(promises);

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

    const sessionIds = [...new Set(posts.map((post) => post.sessionId))];

    // Get the associated session keys for the posts
    const sessionKeys = await prisma.sessionKey.findMany({
      where: {
        sessionId: { in: sessionIds },
        recipientDid,
      },
    });

    let newCursor;

    if (posts.length === (options.limit ?? DEFAULT_LIMIT)) {
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

  async getPostThread(
    req: ExtendedRequest,
    recipientDid: string,
    { uri, limit }: { uri: string; limit?: number },
  ): Promise<{
    cursor?: string;
    encryptedPost: EncryptedPost;
    encryptedReplyPosts: EncryptedPost[];
    encryptedParentPost?: EncryptedPost;
    encryptedRootPost?: EncryptedPost;
    encryptedSessionKeys: SessionKey[];
  }> {
    // Load post identified by uri
    const [canonicalUri] = await canonicalUris(
      [uri],
      (req.user as User).token as string,
      true,
    );

    const post = await loadPrivatePost(canonicalUri, recipientDid);

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    // Load reply posts
    // Load parent post
    const promises = [];

    let replyPosts: EncryptedPost[] = [];
    let parentPost: EncryptedPost | null = null;
    let rootParentPost: EncryptedPost | null = null;

    promises.push(
      prisma.encryptedPost
        .findMany({
          where: {
            session: {
              sessionKeys: {
                some: {
                  recipientDid: recipientDid,
                },
              },
            },
            OR: [{ replyRootUri: post?.uri }, { replyUri: post?.uri }],
          },
          take: limit,
        })
        .then((posts) => {
          replyPosts = posts;
        }),
    );

    if (
      post?.replyUri &&
      post?.replyUri?.includes('social.spkeasy.feed.privatePost')
    ) {
      promises.push(
        loadPrivatePost(post?.replyUri, recipientDid).then((post) => {
          parentPost = post;
        }),
      );
    }

    if (
      post?.replyRootUri &&
      post?.replyRootUri?.includes('social.spkeasy.feed.privatePost')
    ) {
      promises.push(
        loadPrivatePost(post?.replyRootUri, recipientDid).then((post) => {
          rootParentPost = post;
        }),
      );
    }

    await Promise.all(promises);

    const allSessionIds = [
      post?.sessionId,
      ...replyPosts.map((post) => post.sessionId),
      parentPost ? (parentPost as EncryptedPost).sessionId : undefined,
      rootParentPost ? (rootParentPost as EncryptedPost).sessionId : undefined,
    ].filter((id): id is string => id !== undefined);

    const sessionIds: string[] = [...new Set(allSessionIds)];

    const sessionKeys = await prisma.sessionKey.findMany({
      where: {
        sessionId: { in: sessionIds },
        recipientDid,
      },
    });

    return {
      // FIXME: Send cursor if there are more replies
      cursor: undefined,
      encryptedPost: post,
      encryptedReplyPosts: replyPosts,
      encryptedParentPost: parentPost ?? undefined,
      encryptedRootPost: rootParentPost ?? undefined,
      encryptedSessionKeys: sessionKeys,
    };
  }
}

async function loadPrivatePost(
  cannonicalUri: string,
  recipientDid: string,
): Promise<EncryptedPost | null> {
  return prisma.encryptedPost.findFirst({
    where: {
      session: {
        sessionKeys: {
          some: {
            recipientDid: recipientDid,
          },
        },
      },
      uri: cannonicalUri,
    },
  });
}

async function fetchPublicOrPrivatePost(
  req: ExtendedRequest,
  recipientDid: string,
  uri: string,
) {
  if (uri.includes('/social.spkeasy.feed.privatePost/')) {
    return {
      encryptedPost: await loadPrivatePost(uri, recipientDid),
    };
  }

  const post = await fetchBlueskyPosts(
    [uri],
    (req.user as User).token as string,
  );

  return { post };
}

/**
 * Converts a list of URIs to their canonical form by resolving handles to DIDs.
 * This function handles both direct DID URIs and handle-based URIs, ensuring all
 * URIs are in the canonical format with resolved DIDs.
 *
 * This will attempt to resulve first from the did cache, but if that fails will
 * send a request to Bluesky API to resolve
 *
 * @param uris - Array of URIs to convert to canonical form. URIs can be in the format:
 *              - `at://did:plc:.../social.spkeasy.feed.privatePost/rkey`
 *              - `at://handle.bsky.social/social.spkeasy.feed.privatePost/rkey`
 * @param token - Authentication token used to fetch Bluesky profile information
 * @param failOnError - If true, throws an error when a handle cannot be resolved to a DID.
 *                     If false, silently skips unresolvable handles.
 * @returns Promise that resolves to an array of canonical URIs in the format:
 *          `at://did:plc:.../social.spkeasy.feed.privatePost/rkey`
 * @throws Error if failOnError is true and any handle cannot be resolved to a DID
 */
async function canonicalUris(
  uris: string[],
  token: string,
  failOnError: boolean = false,
) {
  const uriParts = uris.map((uri) => {
    const parts = uri.split('/');
    return { did: parts[2], collection: parts[3], rkey: parts[4] };
  });

  const didUris = uriParts.filter((uri) => uri.did.startsWith('did:'));
  const handleUris = uriParts.filter((uri) => !uri.did.startsWith('did:'));

  const cachedDids = await prisma.userDidCache.findMany({
    where: { handle: { in: handleUris.map((uri) => uri.did) } },
  });

  const missingDids = handleUris.filter(
    (uri) => !cachedDids.find((cachedDid) => cachedDid.handle === uri.did),
  );

  const fetchedDids = await Promise.all(
    missingDids.map(async (did) => {
      const profile = await fetchBlueskyProfile(did.did, { token });
      return {
        userDid: profile.did,
        handle: profile.handle,
      };
    }),
  );

  if (failOnError && fetchedDids.length !== missingDids.length) {
    throw new Error('Could not resolve handle to DID');
  }

  const didMap = new Map(
    [...fetchedDids, ...cachedDids].map((did) => [did.handle, did.userDid]),
  );

  const resolvedHandleUris = handleUris.map((uriParts) => ({
    ...uriParts,
    did: didMap.get(uriParts.did),
  }));

  const canonicalUris = [...resolvedHandleUris, ...didUris].map(
    (uriParts) =>
      `at://${uriParts.did}/social.spkeasy.feed.privatePost/${uriParts.rkey}`,
  );

  return canonicalUris;
}
