// Re-export shared job types from session-management
export type {
  AddRecipientToSessionJob,
  RevokeSessionJob,
  DeleteSessionKeysJob,
} from '@speakeasy-services/session-management';

import type { SafeText } from '@speakeasy-services/common';

// Types specific to private-sessions
export interface UpdateSessionKeysJob {
  prevKeyId: string;
  newKeyId: string;
  prevPrivateKey: SafeText;
  newPublicKey: SafeText;
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
  token: string;
  _encrypted?: 'v1';
}

export interface DeleteMediaJob {
  key: string;
}
