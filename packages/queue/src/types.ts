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

export type JobName = typeof JOB_NAMES[keyof typeof JOB_NAMES];
