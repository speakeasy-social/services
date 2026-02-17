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
import type { SafeText } from '@speakeasy-services/common';
import { getPrismaClient } from '../db.js';
import { Queue } from '@speakeasy-services/queue';
import { JOB_NAMES } from '@speakeasy-services/queue';

const prisma = getPrismaClient();

const DEFAULT_LIMIT = 40;

export type AnnotatedEncryptedPost = EncryptedPost & {
  viewer?: {
    like: boolean;
  };
};

interface GetPostsOptions {
  limit?: number;
  cursor?: string;
  authorDids?: string[];
  uris?: string[];
  replyTo?: string;
  filter?: string;
  hasReplies?: boolean;
  hasMedia?: boolean;
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
        encryptedContent: SafeText;
        media: { key: string }[];
      }[];
      sessionId: string;
    },
  ): Promise<void> {
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
            langs: post.langs,
            replyRootUri: post.reply?.root?.uri ?? null,
            replyUri: post.reply?.parent?.uri ?? null,
          };
        }),
      });

      await prisma.mediaPost.createMany({
        data: body.encryptedPosts.flatMap((post) =>
          post.media.map((m) => ({
            mediaKey: m.key,
            encryptedPostUri: post.uri,
          })),
        ),
      });
    });

    // Process reply notifications
    if (body.encryptedPosts[0].reply) {
      await Queue.publish(JOB_NAMES.NOTIFY_REPLY, {
        uri: body.encryptedPosts[0].uri,
        token,
      });
    }

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
      // Filter out null values and the author did
      .filter((did): did is string => did !== null && did !== authorDid);

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
    encryptedPosts: AnnotatedEncryptedPost[];
    encryptedSessionKeys: SessionKey[];
    cursor?: string;
  }> {
    const token = (req.user as User).token as string;

    const promises: Promise<void>[] = [];

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
    // Post visibility is determined by session_key presence, not session state.
    // Session expiry/revocation controls whether NEW posts can use the session,
    // but OLD posts remain visible as long as the user has a session_key.
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

    if (options.hasReplies === true) {
      where.replyUri = { not: null };
    }

    if (options.hasMedia === true) {
      where.mediaPosts = { some: {} };
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
      include: {
        ...postIncludeForViewer(recipientDid),
        // Include parent and root posts to get their session IDs
        parent: {
          select: {
            sessionId: true,
          },
        },
        root: {
          select: {
            sessionId: true,
          },
        },
      },
    });

    const postSessionIds = posts.map((post) => post.sessionId);

    // Create a map of session IDs to URIs from all posts (including parent and root)
    const uriToSessionIds = new Map<string, string>();
    posts.forEach((post) => {
      if (post.parent) {
        uriToSessionIds.set(post.replyUri!, post.parent.sessionId);
      }
      if (post.root) {
        uriToSessionIds.set(post.replyRootUri!, post.root.sessionId);
      }
    });

    const replySessionIds: string[] = [...uriToSessionIds.values()];
    const urisToCheckAccess: string[] = [...uriToSessionIds.keys()];

    const extraSessionIds = replySessionIds.filter(
      (id) => !postSessionIds.includes(id),
    );

    // Get session keys for all relevant sessions
    const [sessionKeys, extraSessionKeys] = await Promise.all([
      prisma.sessionKey.findMany({
        where: {
          sessionId: { in: postSessionIds },
          recipientDid,
        },
      }),
      prisma.sessionKey.findMany({
        where: {
          sessionId: { in: extraSessionIds },
          recipientDid,
        },
        select: {
          sessionId: true,
        },
      }),
    ]);

    const allSessionKeys = [...sessionKeys, ...extraSessionKeys];

    // Create a set of URIs that the user has access to
    const accessibleReplyUris: Set<string> = new Set(
      urisToCheckAccess.filter((uri) => {
        const sessionId = uriToSessionIds.get(uri);
        return sessionId
          ? allSessionKeys.find((key) => key.sessionId === sessionId)
          : false;
      }),
    );

    let newCursor;

    if (posts.length === (options.limit ?? DEFAULT_LIMIT)) {
      const lastPost = posts[posts.length - 1];
      // Cursor is base64 encoded string of createdAt and rkey
      newCursor = encodeCursor(lastPost);
    }

    return {
      encryptedPosts: posts.map((post) => {
        const annotatedPost = annotatePost(post);
        // Hide reply URIs if user doesn't have access
        if (shouldHideReply(post.replyRootUri, accessibleReplyUris)) {
          annotatedPost.replyRootUri = null;
          annotatedPost.root = null;
        }
        if (shouldHideReply(post.replyUri, accessibleReplyUris)) {
          annotatedPost.replyUri = null;
          annotatedPost.parent = null;
        }
        return annotatedPost;
      }),
      encryptedSessionKeys: sessionKeys.filter((key) =>
        postSessionIds.includes(key.sessionId),
      ),
      cursor: newCursor,
    };
  }

  async getPostThread(
    req: ExtendedRequest,
    recipientDid: string,
    { uri, limit = DEFAULT_LIMIT }: { uri: string; limit?: number },
  ): Promise<{
    cursor?: string;
    encryptedPost: AnnotatedEncryptedPost;
    encryptedReplyPosts: AnnotatedEncryptedPost[];
    encryptedParentPosts: AnnotatedEncryptedPost[];
    encryptedSessionKeys: SessionKey[];
  }> {
    // Load post identified by uri
    const [canonicalUri] = await canonicalUris(
      [uri],
      (req.user as User).token as string,
      true,
    );

    // Load reply posts
    // Load parent post
    const promises: [
      Promise<EncryptedPost & { _count: { reactions: number } }>,
      Promise<(EncryptedPost & { _count: { reactions: number } })[]>,
      Promise<(EncryptedPost & { _count: { reactions: number } })[]>,
    ] = [
      prisma.encryptedPost
        .findFirst({
          where: {
            session: {
              sessionKeys: {
                some: {
                  recipientDid: recipientDid,
                },
              },
            },
            uri: canonicalUri,
          },
          include: postIncludeForViewer(recipientDid),
        })
        .then((p) => {
          if (!p) {
            throw new NotFoundError('Post not found');
          }
          return p;
        }),

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
            OR: [{ replyRootUri: canonicalUri }, { replyUri: canonicalUri }],
          },
          take: limit || 20,
          include: postIncludeForViewer(recipientDid),
          orderBy: {
            createdAt: 'desc',
          },
        })
        .then(async (replies) => {
          if (replies.length < limit) {
            const nestedReplies = await prisma.encryptedPost.findMany({
              where: {
                session: {
                  sessionKeys: {
                    some: {
                      recipientDid: recipientDid,
                    },
                  },
                },
                replyUri: { in: replies.map((post) => post.uri) },
                uri: { notIn: replies.map((post) => post.uri) },
              },
              take: limit - replies.length,
              include: postIncludeForViewer(recipientDid),
              orderBy: {
                createdAt: 'desc',
              },
            });
            replies.push(...nestedReplies);
          }
          return replies;
        }),

      prisma
        .$queryRaw<
          Array<EncryptedPost & { reaction_count: number; depth: number }>
        >(
          Prisma.sql`
            WITH RECURSIVE post_chain AS (
              -- Base case: start with the current post
              SELECT
                ep.*,
                (EXISTS (
                  SELECT 1 FROM reactions r
                  WHERE r.uri = ep.uri AND r."userDid" = ${recipientDid}
                ))::int as reaction_count,
                1 as depth
              FROM encrypted_posts ep
              WHERE ep.uri = ${canonicalUri}
              AND ep."sessionId" IN (
                SELECT sk."sessionId"
                FROM session_keys sk
                WHERE sk."recipientDid" = ${recipientDid}
              )

              UNION ALL

              -- Recursive case: join with parent posts
              SELECT
                parent.*,
                (EXISTS (
                  SELECT 1 FROM reactions r
                  WHERE r.uri = parent.uri AND r."userDid" = ${recipientDid}
                ))::int as reaction_count,
                pc.depth + 1
              FROM encrypted_posts parent
              INNER JOIN post_chain pc ON parent.uri = pc."replyUri"
              WHERE parent."sessionId" IN (
                SELECT sk."sessionId"
                FROM session_keys sk
                WHERE sk."recipientDid" = ${recipientDid}
              )
              AND pc.depth < 30
            )
            SELECT * FROM post_chain
            WHERE depth > 1
            ORDER BY depth ASC
          `,
          recipientDid,
          canonicalUri,
        )
        .then((posts) =>
          posts.map((post) => ({
            ...post,
            _count: { reactions: post.reaction_count },
          })),
        ),
    ];

    const [post, replyPosts, parentPosts] = await Promise.all(promises);

    if (
      post.replyUri &&
      !replyPosts.some((reply) => reply.uri === post.replyUri) &&
      !parentPosts.some((parent) => parent.uri === post.replyUri)
    ) {
      const replyRootUri = parentPosts[0]?.replyRootUri || post.replyUri;
      const loadedPost = await loadPrivatePost(replyRootUri, recipientDid);
      if (loadedPost) {
        parentPosts.push(loadedPost);
      }
    }

    const sessionIds = [
      post.sessionId,
      ...replyPosts.map((post) => post.sessionId),
      ...parentPosts.map((post) => post.sessionId),
    ].filter((id): id is string => id !== undefined);

    // Fetch session keys and sessions with their sessionKeys for authorization
    const [sessionKeys, sessions] = await Promise.all([
      prisma.sessionKey.findMany({
        where: {
          sessionId: { in: sessionIds },
          recipientDid,
        },
      }),
      prisma.session.findMany({
        where: {
          id: { in: sessionIds },
        },
        select: {
          id: true,
          sessionKeys: {
            where: { recipientDid },
            select: {
              recipientDid: true,
            },
          },
        },
      }),
    ]);

    // Create a map of sessionId to session for easy lookup
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));

    // Enrich parent posts with session info (they come from raw SQL without it)
    const enrichedParentPosts = parentPosts.map((p) => ({
      ...p,
      session: sessionMap.get(p.sessionId),
    }));

    return {
      // FIXME: Send cursor if there are more replies
      cursor: undefined,
      encryptedPost: annotatePost(post),
      encryptedReplyPosts: replyPosts.map(annotatePost),
      encryptedParentPosts: enrichedParentPosts.map(annotatePost),
      encryptedSessionKeys: sessionKeys,
    };
  }

  async deletePost(uri: string) {
    await prisma.$transaction(async (tx) => {
      const post = await tx.encryptedPost.findFirst({
        where: {
          uri,
        },
        include: {
          mediaPosts: true,
          session: true,
        },
      });

      if (!post) {
        throw new NotFoundError('Post not found');
      }

      post.mediaPosts.forEach((mediaPost) => {
        Queue.publish(JOB_NAMES.DELETE_MEDIA, {
          key: mediaPost.mediaKey,
        });
      });

      await tx.mediaPost.deleteMany({
        where: {
          encryptedPostUri: post.uri,
        },
      });

      await tx.encryptedPost.delete({
        where: {
          uri,
        },
      });

      // If the session has been closed, and there's no
      // other posts in the session, may as well clean up the
      // session
      if (post.session.revokedAt) {
        const otherPost = await tx.encryptedPost.findFirst({
          where: {
            sessionId: post.sessionId,
          },
        });

        if (!otherPost) {
          await tx.sessionKey.deleteMany({
            where: {
              sessionId: post.sessionId,
            },
          });
          await tx.session.delete({
            where: {
              id: post.sessionId,
            },
          });
        }
      }
    });
  }
}

async function loadPrivatePost(
  cannonicalUri: string,
  recipientDid: string,
): Promise<(EncryptedPost & { _count: { reactions: number } }) | null> {
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
    include: postIncludeForViewer(recipientDid),
  });
}

export async function fetchPublicOrPrivatePost(
  token: string,
  recipientDid: string,
  uri: string,
) {
  if (uri.includes('/social.spkeasy.feed.privatePost/')) {
    return {
      encryptedPost: await loadPrivatePost(uri, recipientDid),
    };
  }

  const post = await fetchBlueskyPosts([uri], token);

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

export function getDIDFromUri(uri: string) {
  const parts = uri.split('/');
  return parts[2];
}

function annotatePost(
  post: EncryptedPost & {
    _count: { reactions: number };
    parent?: { sessionId: string } | null;
    root?: { sessionId: string } | null;
  },
) {
  return {
    ...post,
    viewer: {
      like: post._count.reactions > 0,
    },
  };
}

/**
 * Prisma include clause for post queries that provides viewer-specific data.
 * Includes:
 * - Reaction count for the viewer (to show if they've liked the post)
 * - Session with the viewer's session key (for authorization checks)
 *
 * @param recipientDid - The DID of the user viewing the posts
 */
function postIncludeForViewer(recipientDid: string) {
  return {
    _count: {
      select: { reactions: { where: { userDid: recipientDid } } },
    },
    session: {
      select: {
        sessionKeys: {
          where: { recipientDid },
          select: {
            recipientDid: true,
          },
        },
      },
    },
  };
}

function shouldHideReply(
  replyUri: string | null,
  accessibleReplyUris: Set<string>,
) {
  if (!replyUri || !replyUri.includes('/social.spkeasy')) {
    return false;
  }
  return !accessibleReplyUris.has(replyUri);
}
