import { Session, SessionKey } from '../generated/prisma-client/index.js';
import { createView, createListView } from '@speakeasy-services/common';

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
    encryptedDek: (value: Uint8Array) => value.toString('base64'),
    recipientDid: (value: string) => value,
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
