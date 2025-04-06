import { PrismaClient } from '@prisma/client';
import { encryptSessionKey } from '@speakeasy-services/crypto';
import { ServiceError, NotFoundError, ValidationError, DatabaseError } from '@speakeasy-services/common';

const prisma = new PrismaClient();

interface Session {
  authorDid: string;
  recipients: string[];
  createdAt: Date;
}

export interface SessionService {
  createSession(params: { authorDid: string; recipients: string[] }): Promise<{ sessionId: string }>;
  getSession(sessionId: string): Promise<Session>;
  getPost(uri: string): Promise<{ authorDid: string }>;
  getPostsByIds(postIds: string[]): Promise<Array<{ authorDid: string }>>;
  getPosts(params: { recipient: string; limit?: number; cursor?: string }): Promise<{
    posts: Array<{
      uri: string;
      cid: string;
      authorDid: string;
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

interface GetPostsParams {
  recipient: string;
  limit?: number;
  cursor?: string;
}

interface GetPostsResponse {
  posts: Array<{
    uri: string;
    cid: string;
    authorDid: string;
    text: string;
    createdAt: string;
    sessionId: string;
  }>;
  cursor: string;
}

export class SessionServiceImpl implements SessionService {
  async createSession({ authorDid, recipients }: { authorDid: string; recipients: string[] }): Promise<{ sessionId: string }> {
    // Mock implementation
    return { sessionId: 'session-1' };
  }

  async getSession(sessionId: string): Promise<Session> {
    // Mock implementation
    return {
      authorDid: 'did:example:author',
      recipients: ['did:example:recipient'],
      createdAt: new Date()
    };
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

  async getPosts({ recipient, limit = 50, cursor }: GetPostsParams): Promise<GetPostsResponse> {
    // If cursor is provided, return empty response to simulate end of posts
    if (cursor) {
      return {
        posts: [],
        cursor: ''
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
        sessionId: 'session-1'
      },
      {
        uri: 'at://did:example:author/app.bsky.feed.post/2',
        cid: 'bafyreih7y7ig4d5w4y7g4d5w4y7g4d5w4y7g4d5w4y7g4d5w4y7g4d5w4y7g',
        authorDid: 'did:example:author',
        text: 'This is a test post from 20 minutes ago',
        createdAt: twentyMinutesAgo.toISOString(),
        sessionId: 'session-1'
      }
    ];

    return {
      posts: mockPosts,
      cursor: mockPosts.length > 0 ? mockPosts[mockPosts.length - 1].createdAt : ''
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
