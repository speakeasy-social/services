import type { JOB_NAMES } from './index.js';

export interface Job<T> {
  id: string;
  name: string;
  data: T;
}

export interface AddRecipientToSessionJob {
  authorDid: string;
  recipientDid: string;
}

export interface RevokeSessionJob {
  authorDid: string;
  recipientDid?: string;
}

export interface DeleteSessionKeysJob {
  authorDid: string;
  recipientDid: string;
}

export interface UpdateSessionKeysJob {
  prevKeyId: string;
  newKeyId: string;
  // SECURITY: These fields contain private key material stored in the job queue (PostgreSQL).
  // Encrypted at rest using Queue.encryptField() when JOB_QUEUE_ENCRYPTION_KEY is set.
  // The architecture still requires the server to hold private keys during key rotation.
  // Future work should move to a client-side key management model where private keys never
  // reach the server. See security review findings A1/A2.
  prevPrivateKey: string;
  newPublicKey: string;
  _encrypted?: 'v1';
}

export interface PopulateDidCacheJob {
  dids: string[];
  host: string;
}

export interface NotifyReactionJob {
  authorDid: string;
  uri: string;
}

export interface NotifyReplyJob {
  uri: string;
  // SECURITY: Contains the user's Bluesky access JWT stored in the job queue (PostgreSQL).
  // Encrypted at rest using Queue.encryptField() when JOB_QUEUE_ENCRYPTION_KEY is set.
  // Future work should avoid passing user tokens through the job queue entirely.
  // See security review finding Z5.
  token: string;
  _encrypted?: 'v1';
}

export interface DeleteMediaJob {
  key: string;
}

export interface UpdateUserKeysJob {
  prevKeyId: string;
  newKeyId: string;
}

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export type JobDataMap = {
  'add-recipient-to-session': AddRecipientToSessionJob;
  'delete-media': DeleteMediaJob;
  'revoke-session': RevokeSessionJob;
  'delete-session-keys': DeleteSessionKeysJob;
  'update-user-keys': UpdateUserKeysJob;
  'update-session-keys': UpdateSessionKeysJob;
  'populate-did-cache': PopulateDidCacheJob;
  'notify-reaction': NotifyReactionJob;
  'notify-reply': NotifyReplyJob;
};
