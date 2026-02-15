import { SessionKeyModel } from '../session.service.js';

import {
  createView,
  createListView,
  safeBtoa,
} from '@speakeasy-services/common';
import type { SafeText } from '@speakeasy-services/common';

export type EncryptedSessionKeyView = {
  sessionId: string;
  encryptedDek: SafeText;
  recipientDid: string;
  createdAt: string;
};

/**
 * Create a view that picks recipientDid and createdAt, converting createdAt to ISO string
 */
export const toSessionKeyView = createView<
  SessionKeyModel,
  EncryptedSessionKeyView
>(['sessionId', 'encryptedDek', 'recipientDid', 'createdAt'], {
  sessionId: (value: string) => value,
  encryptedDek: (value: Uint8Array) => safeBtoa(value),
  recipientDid: (value: string) => value,
  userKeyPairId: (value: string) => value,
  createdAt: (value: Date) => value.toISOString(),
});

/**
 * Create a list view that maps over the array
 */
export const toSessionKeyListView = createListView<
  SessionKeyModel,
  EncryptedSessionKeyView
>(toSessionKeyView);
