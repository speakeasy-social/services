import { Worker } from '@speakeasy-services/service-base';
import { Queue, JOB_NAMES } from '@speakeasy-services/queue';
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
}

const worker = new Worker({ name: 'trusted-users-worker' });
const queue = Queue.getInstance();
const prisma = new PrismaClient();

/**
 * When a new recipient is added, ask the private-sessions service to add them to the session.
 */
queue.work<AddRecipientToSessionJob>(
  JOB_NAMES.ADD_RECIPIENT_TO_SESSION,
  async (job) => {
    const { authorDid, recipientDid } = job.data;

    const session = await prisma.session.findFirst({
      where: { authorDid, revokedAt: null },
      select: { id: true },
    });

    // If there's no active session, we don't need add the recipient
    // they will be added when the next session is created
    if (!session) return;

    const [sessionKey, authorPrivateKeyBody, recipientPublicKeyBody] =
      await Promise.all([
        prisma.sessionKey.findFirst({
          where: { sessionId: session.id, recipientDid: authorDid },
          select: { encryptedDek: true },
        }),
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

    if (!sessionKey) {
      throw new Error('Session key not found');
    }

    // Decrypt session DEK using author private key
    const decryptedDek = decryptSessionKey(
      sessionKey.encryptedDek.toString(),
      authorPrivateKeyBody.privateKey,
    );

    // Encrypt session DEK using recipient public key
    const encryptedDek = encryptSessionKey(
      decryptedDek,
      recipientPublicKeyBody.publicKey,
    );

    await prisma.sessionKey.create({
      data: {
        sessionId: session.id,
        recipientDid,
        encryptedDek: Buffer.from(encryptedDek),
      },
    });
  },
);

/**
 * Request a new session for an author
 */
queue.work<RotateSessionJob>(JOB_NAMES.REVOKE_SESSION, async (job) => {
  const { authorDid } = job.data;

  await speakeasyApiRequest(
    {
      method: 'POST',
      path: 'social.spkeasy.privateSession.Session',
      fromService: 'trusted-users',
      toService: 'private-sessions',
    },
    {
      authorDid,
    },
  );
});

worker.start().catch((error: Error) => {
  console.error('Failed to start worker:', error);
  throw error;
});
