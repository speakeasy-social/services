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

export class SessionService {
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

  async getSession(sessionId: string): Promise<Session> {
    // Mock implementation
    return {
      authorDid: 'did:example:author',
      recipients: ['did:example:recipient'],
      createdAt: new Date(),
    };
  }

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
   * Bulk create encrypted posts
   * @param authorDid - The author DID
   * @param body - The body of the request
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

  async getPosts({ recipient, limit = 50, cursor }): Promise<EncryptedPost[]> {
    // If cursor is provided, return empty response to simulate end of posts
    if (cursor) {
      return {
        posts: [],
        cursor: '',
      };
    }

    // Mock posts for testing
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);

    const mockPosts = [
      {
        uri: 'at://did:example:author/app.bsky.feed.post/1',
        cid: 'bafyreih7y7ig4d5w4y7g4d5w4y7g4d5w4y7g4d5w4y7g4d5w4y7g4d5w4y7g',
        authorDid: 'did:example:author',
        text: 'This is a test post from 1 minute ago',
        createdAt: oneMinuteAgo.toISOString(),
        sessionId: 'session-1',
      },
      {
        uri: 'at://did:example:author/app.bsky.feed.post/2',
        cid: 'bafyreih7y7ig4d5w4y7g4d5w4y7g4d5w4y7g4d5w4y7g4d5w4y7g4d5w4y7g',
        authorDid: 'did:example:author',
        text: 'This is a test post from 20 minutes ago',
        createdAt: twentyMinutesAgo.toISOString(),
        sessionId: 'session-1',
      },
    ];

    return {
      posts: mockPosts,
      cursor:
        mockPosts.length > 0 ? mockPosts[mockPosts.length - 1].createdAt : '',
    };
  }

  async getBulk(sessionIds: string[]): Promise<
    Array<{
      sessionId: string;
      authorDid: string;
      createdAt: string;
      expiresAt?: string;
      revokedAt?: string;
    }>
  > {
    const sessions = await prisma.session.findMany({
      where: { id: { in: sessionIds } },
      select: {
        id: true,
        authorDid: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    if (sessions.length !== sessionIds.length) {
      throw new NotFoundError('One or more sessions not found');
    }

    return sessions.map((session) => ({
      sessionId: session.id,
      authorDid: session.authorDid,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt?.toISOString(),
      revokedAt: session.revokedAt?.toISOString(),
    }));
  }

  async revokeSession(authorDid: string): Promise<{ success: boolean }> {
    await prisma.session.update({
      where: { authorDid, revokedAt: null },
      data: { revokedAt: new Date() },
      select: { id: true },
    });

    return { success: true };
  }

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
