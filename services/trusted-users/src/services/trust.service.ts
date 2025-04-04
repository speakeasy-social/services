import { PrismaClient, Prisma } from '@prisma/client';
import { scheduleAddRecipientToSession } from '@speakeasy-services/common/src/queue.js';
import { JOB_NAMES, Queue } from '@speakeasy-services/private-sessions/worker.js';
import { ServiceError, NotFoundError, ValidationError, DatabaseError } from '@speakeasy-services/common/errors.js';

const prisma = new PrismaClient();

export class TrustService {
  async getTrustedBy(did: string) {
    try {
      const recipients = await this.getTrustedRecipients(did);
      return {
        trustedBy: recipients.map(recipient => ({
          did: recipient.did,
          createdAt: recipient.createdAt.toISOString()
        }))
      };
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new DatabaseError('Failed to get trusted users');
    }
  }

  async addTrusted(did: string) {
    try {
      // TODO: Get authorDid from authenticated user context
      const authorDid = 'did:example:author'; // This should come from auth context
      await this.addTrustedUser(authorDid, did);
      return {
        success: true
      };
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      if (error instanceof Error && error.message === 'Trust relationship already exists') {
        throw new ValidationError('User is already trusted');
      }
      throw new DatabaseError('Failed to add trusted user');
    }
  }

  async removeTrusted(did: string) {
    try {
      // TODO: Get authorDid from authenticated user context
      const authorDid = 'did:example:author'; // This should come from auth context
      await this.removeTrustedUser(authorDid, did);
      return {
        success: true
      };
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      if (error instanceof Error && error.message === 'Trust relationship does not exist') {
        throw new NotFoundError('User is not trusted');
      }
      throw new DatabaseError('Failed to remove trusted user');
    }
  }

  private async addTrustedUser(authorDid: string, recipientDid: string): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Check if relationship already exists
      const existingRelation = await tx.trustedUsers.findFirst({
        where: {
          authorDid,
          recipientDid,
          deletedAt: null
        }
      });

      if (existingRelation) {
        throw new ValidationError('Trust relationship already exists');
      }

      // Create trust relationship
      await tx.trustedUsers.create({
        data: {
          authorDid,
          recipientDid,
          createdAt: new Date()
        }
      });
    });

    // Schedule session update after transaction completes
    await scheduleAddRecipientToSession(authorDid, recipientDid);
  }

  private async removeTrustedUser(authorDid: string, recipientDid: string): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Find and mark existing relationship as deleted
      const existingRelation = await tx.trustedUsers.findFirst({
        where: {
          authorDid,
          recipientDid,
          deletedAt: null
        }
      });

      if (!existingRelation) {
        throw new NotFoundError('Trust relationship does not exist');
      }

      // Mark relationship as deleted
      await tx.trustedUsers.update({
        where: {
          authorDid_recipientDid_createdAt: {
            authorDid,
            recipientDid,
            createdAt: existingRelation.createdAt
          }
        },
        data: {
          deletedAt: new Date()
        }
      });

      // Revoke sessions where this was the only recipient
      await tx.sessions.updateMany({
        where: {
          authorDid,
          revokedAt: null,
          sessionKeys: {
            some: { recipientDid },
            // Check if this is the only recipient
            every: { recipientDid }
          }
        },
        data: {
          revokedAt: new Date()
        }
      });

      // Remove all session keys for this recipient
      await tx.sessionKeys.deleteMany({
        where: {
          recipientDid,
          session: {
            authorDid,
            revokedAt: null
          }
        }
      });
    });
  }

  private async getTrustedRecipients(authorDid: string): Promise<Array<{ did: string; createdAt: Date }>> {
    const relations = await prisma.trustedUsers.findMany({
      where: {
        authorDid,
        deletedAt: null
      },
      select: {
        recipientDid: true,
        createdAt: true
      }
    });

    return relations.map(r => ({
      did: r.recipientDid,
      createdAt: r.createdAt
    }));
  }
}
