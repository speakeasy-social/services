import { Worker } from '@speakeasy-services/service-base';
import { Queue, JOB_NAMES } from '@speakeasy-services/queue';
import { speakeasyApiRequest } from '@speakeasy-services/common';

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

    await speakeasyApiRequest(
      {
        method: 'POST',
        path: 'social.spkeasy.privateSession.addUser',
        fromService: 'trusted-users',
        toService: 'private-sessions',
      },
      {
        authorDid,
        recipientDid,
      },
    );
  },
);

queue.work<RotateSessionJob>(JOB_NAMES.ROTATE_SESSION, async (job) => {
  const { authorDid } = job.data;

  await speakeasyApiRequest(
    {
      method: 'POST',
      path: 'social.spkeasy.privateSession.rotateSession',
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
