// Re-export shared job types from session-management
export type {
  AddRecipientToSessionJob,
  RevokeSessionJob,
  DeleteSessionKeysJob,
} from '@speakeasy-services/session-management';

// Types specific to private-sessions
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
