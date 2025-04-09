import { Worker } from '@speakeasy-services/service-base';
import { DatabaseError, ServiceError } from '@speakeasy-services/common';
import { Queue, JOB_NAMES } from '@speakeasy-services/queue';
import fetch from 'node-fetch';

interface AddRecipientToSessionJob {
  authorDid: string;
  recipientDid: string;
}

const worker = new Worker({ name: 'trusted-users-worker' });
const queue = Queue.getInstance();

/**
 * When a new recipient is added, ask the private-sessions service to add them to the session.
 */
queue.work<AddRecipientToSessionJob>(
  JOB_NAMES.ADD_RECIPIENT_TO_SESSION,
  async (job) => {
    const { authorDid, recipientDid } = job.data;

    // Make API call to add user to session
    const response = await fetch('social.spkeasy.privateSession.addUser', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer api-key:trusted-users:${process.env.TRUSTED_USERS_API_KEY}`,
      },
      body: JSON.stringify({
        authorDid,
        recipientDid,
      }),
    });

    if (!response.ok) {
      throw new ServiceError(
        `Failed to add recipient to session: ${response.status} ${response.statusText}`,
        response.status,
      );
    }
  },
);

worker.start().catch((error: Error) => {
  console.error('Failed to start worker:', error);
  throw new DatabaseError('Failed to start worker');
});
