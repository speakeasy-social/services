import { Worker } from '@speakeasy-services/service-base';
import { JOB_NAMES } from '@speakeasy-services/queue';
import {
  fetchBlueskyProfile,
  speakeasyApiRequest,
  fetchBlueskyPosts,
} from '@speakeasy-services/common';
import { recryptDEK } from '@speakeasy-services/crypto';
import { healthCheck } from './health.js';
import { getPrismaClient } from './db.js';
import { v4 as uuidv4 } from 'uuid';
interface AddRecipientToSessionJob {
  authorDid: string;
  recipientDid: string;
}

interface RotateSessionJob {
  authorDid: string;
  recipientDid?: string;
}

interface DeleteSessionKeysJob {
  authorDid: string;
  recipientDid: string;
}

interface UpdateSessionKeysJob {
  prevKeyId: string;
  newKeyId: string;
  prevPrivateKey: string;
  newPublicKey: string;
}

interface PopulateDidCacheJob {
  dids: string[];
  host: string;
}

interface NotifyReactionJob {
  authorDid: string;
  uri: string;
}

interface NotifyReplyJob {
  uri: string;
  token: string;
}

interface DeleteMediaJob {
  key: string;
}

const worker = new Worker({
  name: 'private-sessions-worker',
  healthCheck,
  port: 4001,
});

const prisma = getPrismaClient();

// Add a new recipient to 30 days prior
const WINDOW_FOR_NEW_TRUSTED_USER = 30 * 24 * 60 * 60 * 1000;

/**
 * When a new recipient is added, add them to prior sessions.
 */
worker.work<AddRecipientToSessionJob>(
  JOB_NAMES.ADD_RECIPIENT_TO_SESSION,
  async (job) => {
    worker.logger.info('Adding recipient to session');

    const { authorDid, recipientDid } = job.data;

    // Check if the recipient is still trusted
    const trustedResult = await speakeasyApiRequest(
      {
        method: 'GET',
        path: 'social.spkeasy.graph.getTrusted',
        fromService: 'private-sessions',
        toService: 'trusted-users',
      },
      { authorDid, recipientDid },
    );

    if (!trustedResult.trusted.length) {
      return { abortReason: 'Recipient no longer trusted' };
    }

    const sessions = await prisma.session.findMany({
      where: {
        authorDid,
        createdAt: { gt: new Date(Date.now() - WINDOW_FOR_NEW_TRUSTED_USER) },
      },
      include: {
        sessionKeys: {
          where: {
            recipientDid: authorDid,
          },
        },
      },
    });
    const sessionsWithAuthorKeys = sessions.filter(
      (session) => session.sessionKeys.length > 0,
    );

    // User hasn't yet made any private posts, we can stop here
    if (sessionsWithAuthorKeys.length === 0) {
      return;
    }

    // Something went wrong if there are sessions without author keys
    if (sessions.length > sessionsWithAuthorKeys.length) {
      worker.logger.error(
        `Some sessions for ${authorDid} do not have author session keys (${sessions.length} sessions, ${sessionsWithAuthorKeys.length})`,
      );
    }

    if (!sessionsWithAuthorKeys.length) {
      return;
    }

    // Remove from the set any existing session keys
    const existingSessionKeys = await prisma.sessionKey.findMany({
      where: {
        recipientDid,
        sessionId: { in: sessionsWithAuthorKeys.map((session) => session.id) },
      },
      select: {
        sessionId: true,
      },
    });

    const sessionKeysNeeded = sessionsWithAuthorKeys.filter(
      (session) =>
        !existingSessionKeys.some(
          (existingSessionKey) => existingSessionKey.sessionId === session.id,
        ),
    );

    const sessionKeyPairIds = sessionKeysNeeded.map(
      (session) => session.sessionKeys[0].userKeyPairId,
    );

    // Get the author's private keys and the recipient's public key
    // so we can re-encrypt the DEKs for the new recipient
    const [authorPrivateKeysBody, recipientPublicKeyBody] = await Promise.all([
      speakeasyApiRequest(
        {
          method: 'GET',
          path: 'social.spkeasy.key.getPrivateKeys',
          fromService: 'private-sessions',
          toService: 'user-keys',
        },
        { ids: sessionKeyPairIds, did: authorDid },
      ),
      // This will trigger a new key if the recipient doesn't have one
      speakeasyApiRequest(
        {
          method: 'GET',
          path: 'social.spkeasy.key.getPublicKey',
          fromService: 'private-sessions',
          toService: 'user-keys',
        },
        { did: recipientDid },
      ),
    ]);

    const authorPrivateKeys: {
      userKeyPairId: string;
      privateKey: string;
    }[] = authorPrivateKeysBody.keys;

    // Create a map of userKeyPairId to privateKey
    const authorPrivateKeysMap = new Map(
      authorPrivateKeys.map((key) => [key.userKeyPairId, key]),
    );

    const newSessionKeys = (
      await Promise.all(
        sessionKeysNeeded.map(async (session) => {
          const privateKey = authorPrivateKeysMap.get(
            session.sessionKeys[0].userKeyPairId,
          );

          if (!privateKey) {
            return null;
          }

          const encryptedDek = await recryptDEK(
            session.sessionKeys[0],
            privateKey,
            recipientPublicKeyBody.publicKey,
          );

          return {
            sessionId: session.id,
            recipientDid,
            encryptedDek,
            userKeyPairId: recipientPublicKeyBody.userKeyPairId,
          };
        }),
      )
    ).filter((val) => !!val);

    await prisma.sessionKey.createMany({
      data: newSessionKeys,
    });
  },
);

/**
 * Mark any active sessions as revoked
 * New session will be created next time they send a message
 */
worker.queue.work<RotateSessionJob>(JOB_NAMES.REVOKE_SESSION, async (job) => {
  const { authorDid, recipientDid } = job.data;

  await prisma.session.updateMany({
    where: { authorDid, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { revokedAt: new Date() },
  });

  // If a recipient was untrusted, delete their sessions keys
  if (recipientDid) {
    await prisma.sessionKey.deleteMany({
      where: {
        session: {
          authorDid,
        },
        recipientDid,
      },
    });
  }
});

worker.queue.work<DeleteSessionKeysJob>(
  JOB_NAMES.DELETE_SESSION_KEYS,
  async (job) => {
    const { authorDid, recipientDid } = job.data;

    // Check if the recipient is still trusted
    const trustedResult = await speakeasyApiRequest(
      {
        method: 'GET',
        path: 'social.spkeasy.graph.getTrusted',
        fromService: 'private-sessions',
        toService: 'trusted-users',
      },
      { authorDid, recipientDid },
    );

    if (trustedResult.trusted.length) {
      return { abortReason: 'Recipient has been trusted again' };
    }

    await prisma.sessionKey.deleteMany({
      where: { recipientDid, session: { authorDid } },
    });
  },
);

/**
 * Update session keys in batches when user keys are rotated
 */
worker.queue.work<UpdateSessionKeysJob>(
  JOB_NAMES.UPDATE_SESSION_KEYS,
  async (job) => {
    const { prevKeyId, newKeyId, prevPrivateKey, newPublicKey } = job.data;
    const BATCH_SIZE = 100;
    let hasMore = true;

    while (hasMore) {
      const sessionKeys = await prisma.sessionKey.findMany({
        where: { userKeyPairId: prevKeyId },
        take: BATCH_SIZE,
      });

      if (sessionKeys.length === 0) {
        hasMore = false;
        continue;
      }

      await Promise.all(
        sessionKeys.map(async (sessionKey) => {
          const newEncryptedDek = await recryptDEK(
            sessionKey,
            { privateKey: prevPrivateKey, userKeyPairId: prevKeyId },
            newPublicKey,
          );
          await prisma.sessionKey.update({
            where: {
              sessionId_recipientDid: {
                sessionId: sessionKey.sessionId,
                recipientDid: sessionKey.recipientDid,
              },
            },
            data: {
              userKeyPairId: newKeyId,
              encryptedDek: newEncryptedDek,
            },
          });
        }),
      );
    }
  },
);

worker.queue.work<PopulateDidCacheJob>(
  JOB_NAMES.POPULATE_DID_CACHE,
  async (job) => {
    const { dids, host } = job.data;

    const existingDids = (
      await prisma.userDidCache.findMany({
        where: {
          userDid: {
            in: dids,
          },
        },
        select: { userDid: true },
      })
    ).map((did) => did.userDid);

    // Remove existing dids from the did list
    const newDids = dids.filter((did) => !existingDids.includes(did));

    for (const did of newDids) {
      const profile = await fetchBlueskyProfile(did, {
        host,
      });
      prisma.userDidCache.create({
        data: {
          userDid: did,
          handle: profile.handle,
        },
      });
    }
  },
);

worker.queue.work<NotifyReactionJob>(JOB_NAMES.NOTIFY_REACTION, async (job) => {
  const userDid = job.data.uri.split('/')[2];

  if (userDid === job.data.authorDid) {
    return;
  }

  try {
    await prisma.notification.create({
      data: {
        id: uuidv4(),
        userDid,
        authorDid: job.data.authorDid,
        reason: 'like',
        reasonSubject: job.data.uri,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    // Silently ignore unique constraint violations
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return;
    }
    throw error;
  }
});

worker.queue.work<DeleteMediaJob>(JOB_NAMES.DELETE_MEDIA, async (job) => {
  const { key } = job.data;

  await speakeasyApiRequest(
    {
      method: 'POST',
      path: 'social.spkeasy.media.delete',
      fromService: 'private-sessions',
      toService: 'media',
    },
    { key },
  );
});

worker.queue.work<NotifyReplyJob>(JOB_NAMES.NOTIFY_REPLY, async (job) => {
  const { uri } = job.data;

  const latestReply = await prisma.encryptedPost.findUnique({
    where: { uri },
  });

  if (!latestReply) return { abortReason: 'Post not found' };

  const authors = new Set<string>();
  const thread = [];

  // Iterate over all posts from parent to root
  let currentPost: FetchPostResult | null = latestReply;

  while (currentPost?.replyUri) {
    currentPost = await fetchPost(
      job.data.token,
      currentPost.replyUri,
      latestReply.authorDid,
    );

    if (currentPost) {
      thread.push({
        uri: currentPost.uri,
        authorDid: currentPost.authorDid,
        hasSessionKey: currentPost?.session?.sessionKeys?.length! > 0,
      });
    }
  }

  if (
    latestReply.replyRootUri &&
    !thread.some((post) => post.uri === latestReply.replyRootUri)
  ) {
    const replyRoot = await fetchPost(
      job.data.token,
      latestReply.replyRootUri,
      latestReply.authorDid,
    );
    if (replyRoot && replyRoot.authorDid !== latestReply.authorDid) {
      thread.push({
        uri: replyRoot.uri,
        authorDid: replyRoot.authorDid,
        hasSessionKey: replyRoot.session?.sessionKeys.length! > 0,
      });
    }
  }

  thread.forEach((post) => {
    // Notify everyone in the thread once (except the author of the reply)
    if (post.authorDid !== latestReply.authorDid) {
      // Because trust is asymetric, some posts in the thread may not be able
      // to be seen by the author of this new post
      // It may make people confused or worried that privacy isn't working if
      // we notify them that someone they haven't trusted has replied
      // to one of their posts.

      // So we only notify if the author of the new reply can see their posts
      const replyAuthorCanSeePost =
        !post.uri.includes('/social.spkeasy') || post.hasSessionKey;
      if (replyAuthorCanSeePost) {
        authors.add(post.authorDid);
      }
    }
  });

  // Only notify authors who can see the reply
  const authorsThatMaySeeReply = await prisma.sessionKey.findMany({
    where: {
      recipientDid: { in: Array.from(authors) },
      sessionId: latestReply.sessionId,
    },
    select: {
      recipientDid: true,
    },
  });

  await prisma.notification.createMany({
    data: Array.from(authorsThatMaySeeReply).map((author) => ({
      id: uuidv4(),
      userDid: author.recipientDid,
      authorDid: latestReply.authorDid,
      reason: 'reply',
      reasonSubject: uri,
      updatedAt: new Date(),
    })),
  });
});

worker
  .start()
  .then(() => {
    console.log('Private sessions Worker started');
  })
  .catch((error: Error) => {
    console.error('Failed to start worker:', error);
    throw error;
  });

type FetchPostResult = {
  uri: string;
  authorDid: string;
  replyUri: string | null | undefined;
  replyRootUri: string | null | undefined;
  session?: {
    sessionKeys: {
      encryptedDek: Uint8Array<ArrayBufferLike>;
      userKeyPairId: string;
    }[];
  };
} | null;

async function fetchPost(
  token: string,
  uri: string,
  recipientDid: string,
): Promise<FetchPostResult> {
  if (uri.includes('/social.spkeasy')) {
    return await prisma.encryptedPost.findUnique({
      where: { uri },
      include: {
        session: {
          include: {
            sessionKeys: {
              where: {
                recipientDid: recipientDid,
              },
              select: {
                encryptedDek: true,
                userKeyPairId: true,
              },
            },
          },
        },
      },
    });
  }

  const post = await fetchBlueskyPosts([uri], token);
  return {
    uri: post[0].uri,
    authorDid: post[0].author.did,
    replyUri: post[0].record.reply?.parent.uri,
    replyRootUri: post[0].record.reply?.root.uri,
  };
}
