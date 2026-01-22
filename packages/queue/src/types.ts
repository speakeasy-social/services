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
  prevPrivateKey: string;
  newPublicKey: string;
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
  token: string;
}

export interface DeleteMediaJob {
  key: string;
}

export interface UpdateUserKeysJob {
  prevKeyId: string;
  newKeyId: string;
}

export type JobName = typeof JOB_NAMES[keyof typeof JOB_NAMES];

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
