import { PrismaClient } from '@prisma/client';
import { encryptSessionKey } from '@speakeasy-services/crypto';
import { ServiceError, NotFoundError, ValidationError, DatabaseError } from '@speakeasy-services/common';

const prisma = new PrismaClient();

export interface SessionService {
  getSession(sessionId: string): Promise<{ authorDid: string }>;
  getPost(uri: string): Promise<{ authorDid: string }>;
  getPostsByIds(postIds: string[]): Promise<Array<{ authorDid: string }>>;
  getPosts(params: { recipient: string; limit?: number; cursor?: string }): Promise<{
    posts: Array<{
      uri: string;
      cid: string;
      author: { did: string; handle: string };
      text: string;
      createdAt: string;
      sessionId: string;
    }>;
    cursor: string;
  }>;
  getBulk(sessionIds: string[]): Promise<Array<{
    sessionId: string;
    authorDid: string;
    createdAt: string;
    expiresAt?: string;
    revokedAt?: string;
  }>>;
  revokeSession(sessionId: string): Promise<{ success: boolean }>;
  addRecipientToSession(sessionId: string, did: string): Promise<{ success: boolean }>;
}

export class SessionServiceImpl implements SessionService {
  async getSession(sessionId: string): Promise<{ authorDid: string }> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { authorDid: true }
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    return session;
  }

  async getPost(uri: string): Promise<{ authorDid: string }> {
    const post = await prisma.encryptedPost.findUnique({
      where: { postId: uri },
      select: { authorDid: true }
    });

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    return post;
  }

  async getPostsByIds(postIds: string[]): Promise<Array<{ authorDid: string }>> {
    const posts = await prisma.encryptedPost.findMany({
      where: { postId: { in: postIds } },
      select: { authorDid: true }
    });

    if (posts.length !== postIds.length) {
      throw new NotFoundError('One or more posts not found');
    }

    return posts;
  }

  async getPosts(params: { recipient: string; limit?: number; cursor?: string }): Promise<{
    posts: Array<{
      uri: string;
      cid: string;
      author: { did: string; handle: string };
      text: string;
      createdAt: string;
      sessionId: string;
    }>;
    cursor: string;
  }> {
    // If cursor is provided, return empty posts to indicate end of pagination
    if (params.cursor) {
      return {
        posts: [],
        cursor: ''
      };
    }

    const now = new Date();
    const posts = await prisma.encryptedPost.findMany({
      where: {
        session: {
          sessionKeys: {
            some: {
              recipientDid: params.recipient
            }
          }
        },
        createdAt: {
          lte: now
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: params.limit || 50,
      select: {
        postId: true,
        sessionId: true,
        authorDid: true,
        createdAt: true,
        session: {
          select: {
            authorDid: true
          }
        }
      }
    });

    return {
      posts: posts.map(post => ({
        uri: post.postId,
        cid: '', // TODO: Add CID field to schema
        author: {
          did: post.authorDid,
          handle: '' // TODO: Get handle from user service
        },
        text: '', // TODO: Decrypt content
        createdAt: post.createdAt.toISOString(),
        sessionId: post.sessionId
      })),
      cursor: posts.length > 0 ? posts[posts.length - 1].createdAt.toISOString() : ''
    };
  }

  async getBulk(sessionIds: string[]): Promise<Array<{
    sessionId: string;
    authorDid: string;
    createdAt: string;
    expiresAt?: string;
    revokedAt?: string;
  }>> {
    const sessions = await prisma.session.findMany({
      where: { id: { in: sessionIds } },
      select: {
        id: true,
        authorDid: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true
      }
    });

    if (sessions.length !== sessionIds.length) {
      throw new NotFoundError('One or more sessions not found');
    }

    return sessions.map(session => ({
      sessionId: session.id,
      authorDid: session.authorDid,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt?.toISOString(),
      revokedAt: session.revokedAt?.toISOString()
    }));
  }

  async revokeSession(sessionId: string): Promise<{ success: boolean }> {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
      select: { id: true }
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    return { success: true };
  }

  async addRecipientToSession(sessionId: string, did: string): Promise<{ success: boolean }> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true }
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    await prisma.sessionKey.create({
      data: {
        sessionId,
        recipientDid: did,
        encryptedDek: Buffer.from('') // TODO: Generate and encrypt DEK
      }
    });

    return { success: true };
  }
}

// Export the function for use in job handlers
export async function addRecipientToSession(sessionId: string, recipientDid: string): Promise<void> {
  const service = new SessionServiceImpl();
  await service.addRecipientToSession(sessionId, recipientDid);
}
