import { Worker } from '@speakeasy-services/service-base';
import { Queue, JOB_NAMES } from '@speakeasy-services/queue';
import { apiRequest } from '@speakeasy-services/common';

interface AddRecipientToSessionJob {
  authorDid: string;
  recipientDid: string;
}

interface RotateSessionJob {
  authorDid: string;
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

    await apiRequest(
      'POST',
      'social.spkeasy.privateSession.addUser',
      'trusted-users',
      {
        authorDid,
        recipientDid,
      },
    );
  },
);

queue.work<RotateSessionJob>(JOB_NAMES.ROTATE_SESSION, async (job) => {
  const { authorDid } = job.data;

  await apiRequest(
    'POST',
    'social.spkeasy.privateSession.rotateSession',
    'trusted-users',
    {
      authorDid,
    },
  );
});

worker.start().catch((error: Error) => {
  console.error('Failed to start worker:', error);
  throw error;
});
