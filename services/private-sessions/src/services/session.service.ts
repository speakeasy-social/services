import { PrismaClient, Prisma } from '@prisma/client';
import { encryptSessionKey } from '@speakeasy-services/crypto';
import { ServiceError, NotFoundError, ValidationError, DatabaseError } from '@speakeasy-services/common';

const prisma = new PrismaClient();

export interface SessionService {
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
  addUser(sessionId: string, did: string): Promise<{ success: boolean }>;
}

export class SessionServiceImpl implements SessionService {
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
    throw new Error('Not implemented');
  }

  async getBulk(sessionIds: string[]): Promise<Array<{
    sessionId: string;
    authorDid: string;
    createdAt: string;
    expiresAt?: string;
    revokedAt?: string;
  }>> {
    throw new Error('Not implemented');
  }

  async revokeSession(sessionId: string): Promise<{ success: boolean }> {
    throw new Error('Not implemented');
  }

  async addUser(sessionId: string, did: string): Promise<{ success: boolean }> {
    try {
      await this.addRecipientToSession(sessionId, did);
      return { success: true };
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new DatabaseError('Failed to add user to session');
    }
  }

  async addRecipientToSession(sessionId: string, recipientDid: string): Promise<void> {
    const session = await prisma.sessions.findUnique({
      where: { id: sessionId },
      include: {
        sessionKeys: {
          where: { recipientDid },
          select: { id: true }
        }
      }
    });

    if (!session) {
      throw new NotFoundError('Session or recipient not found');
    }

    if (session.revokedAt) {
      throw new ValidationError('Session is revoked');
    }

    if (session.sessionKeys.length > 0) {
      throw new ValidationError('Recipient already has access to this session');
    }

    const sessionKey = await prisma.sessionKeys.create({
      data: {
        sessionId,
        recipientDid,
        encryptedKey: await encryptSessionKey(session.key),
        createdAt: new Date()
      }
    });

    if (!sessionKey) {
      throw new DatabaseError('Failed to create session key');
    }
  }
}

// Export the function for use in job handlers
export async function addRecipientToSession(sessionId: string, recipientDid: string): Promise<void> {
  const service = new SessionServiceImpl();
  await service.addRecipientToSession(sessionId, recipientDid);
}
