import { Worker } from '@speakeasy-services/service-base';
import { JOB_NAMES } from '@speakeasy-services/queue';
import { speakeasyApiRequest } from '@speakeasy-services/common';
import { PrismaClient } from './generated/prisma-client/index.js';
import {
  encryptSessionKey,
  decryptSessionKey,
} from '@speakeasy-services/crypto';

interface AddRecipientToSessionJob {
  authorDid: string;
  recipientDid: string;
}

interface RotateSessionJob {
  authorDid: string;
  recipientDid?: string;
}

const worker = new Worker({ name: 'trusted-users-worker' });
const prisma = new PrismaClient();

// Add a new recipient to 30 days prior
const WINDOW_FOR_NEW_TRUSTED_USER = 30 * 24 * 60 * 60 * 1000;

/**
 * When a new recipient is added, add them to prior sessions.
 */
worker.queue.work<AddRecipientToSessionJob>(
  JOB_NAMES.ADD_RECIPIENT_TO_SESSION,
  async (job) => {
    const { authorDid, recipientDid } = job.data;

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
    const sessionsWithKeys = sessions.filter(
      (session) => session.sessionKeys.length > 0,
    );

    if (sessionsWithKeys.length === 0) {
      worker.logger.error(`No sessions found for author ${authorDid}`);
      return;
    }

    if (sessions.length > sessionsWithKeys.length) {
      worker.logger.error(
        `Some sessions for ${authorDid} do not have author session keys (${sessions.length} sessions, ${sessionsWithKeys.length})`,
      );
    }

    if (!sessionsWithKeys.length) {
      return;
    }

    const [authorPrivateKeyBody, recipientPublicKeyBody] = await Promise.all([
      speakeasyApiRequest(
        {
          method: 'GET',
          path: 'social.spkeasy.keys.getPrivateKey',
          fromService: 'private-sessions',
          toService: 'user-keys',
        },
        { did: authorDid },
      ),
      speakeasyApiRequest(
        {
          method: 'GET',
          path: 'social.spkeasy.keys.getPublicKey',
          fromService: 'private-sessions',
          toService: 'user-keys',
        },
        { did: recipientDid },
      ),
    ]);

    const newSessionKeys = await Promise.all(
      sessionsWithKeys.map(async (session) => {
        // Decrypt session DEK using author private key
        const decryptedDek = await decryptSessionKey(
          session.sessionKeys[0].encryptedDek.toString(),
          authorPrivateKeyBody.privateKey,
        );

        // Encrypt session DEK using recipient public key
        const encryptedDek = await encryptSessionKey(
          decryptedDek,
          recipientPublicKeyBody.publicKey,
        );

        return {
          sessionId: session.id,
          recipientDid,
          encryptedDek: Buffer.from(encryptedDek),
          userKeyPairId: recipientPublicKeyBody.id,
        };
      }),
    );

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

  // If a recipient was revoked, delete their sessions keys
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

worker.start().catch((error: Error) => {
  console.error('Failed to start worker:', error);
  throw error;
});
