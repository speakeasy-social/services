import { v4 as uuidv4 } from 'uuid';
import { fetchBlueskyPosts } from '@speakeasy-services/common';
import type { PrismaClient } from '../generated/prisma-client/index.js';
import type { NotifyReplyJob } from './types.js';

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
  prisma: PrismaClient,
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

export function createNotifyReplyHandler(prisma: PrismaClient) {
  return async (job: { data: NotifyReplyJob }) => {
    const { uri } = job.data;

    const latestReply = await prisma.encryptedPost.findUnique({
      where: { uri },
    });

    if (!latestReply) return { abortReason: 'Post not found' };

    const authors = new Set<string>();
    const thread: {
      uri: string;
      authorDid: string;
      hasSessionKey: boolean;
    }[] = [];

    // Iterate over all posts from parent to root
    let currentPost: FetchPostResult | null = latestReply;

    while (currentPost?.replyUri) {
      currentPost = await fetchPost(
        prisma,
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
        prisma,
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
  };
}
