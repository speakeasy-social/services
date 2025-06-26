import { Session, SessionKey } from '../generated/prisma-client/index.js';
import {
  createView,
  createListView,
  safeBtoa,
} from '@speakeasy-services/common';

// TODO: Replace with shared session views from @speakeasy-services/session-management
// once export issues are resolved
export type EncryptedSessionKeyView = {
  sessionId: string;
  encryptedDek: string;
  recipientDid: string;
  createdAt: string;
};

/**
 * Create a view that picks recipientDid and createdAt, converting createdAt to ISO string
 */
export const toSessionKeyView = createView<SessionKey, EncryptedSessionKeyView>(
  ['sessionId', 'encryptedDek', 'recipientDid', 'createdAt'],
  {
    sessionId: (value: string) => value,
    encryptedDek: (value: Uint8Array) => safeBtoa(value),
    recipientDid: (value: string) => value,
    userKeyPairId: (value: string) => value,
    createdAt: (value: Date) => value.toISOString(),
  },
);

/**
 * Create a list view that maps over the array
 */
export const toSessionKeyListView = createListView<
  SessionKey,
  EncryptedSessionKeyView
>(toSessionKeyView);
