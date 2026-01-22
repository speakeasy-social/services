import { PrivateProfile } from '../generated/prisma-client/index.js';
import {
  createView,
  createListView,
  safeBtoa,
} from '@speakeasy-services/common';

export type ProfileView = {
  id: string;
  sessionId: string;
  authorDid: string;
  encryptedContent: string;
  avatarUri: string | null;
  bannerUri: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Create a view for a single profile
 */
export const toProfileView = createView<PrivateProfile, ProfileView>(
  [
    'id',
    'sessionId',
    'authorDid',
    'encryptedContent',
    'avatarUri',
    'bannerUri',
    'createdAt',
    'updatedAt',
  ],
  {
    id: (value: string) => value,
    sessionId: (value: string) => value,
    authorDid: (value: string) => value,
    encryptedContent: (value: Uint8Array) => safeBtoa(value),
    avatarUri: (value: string | null) => value,
    bannerUri: (value: string | null) => value,
    createdAt: (value: Date) => value.toISOString(),
    updatedAt: (value: Date) => value.toISOString(),
  },
);

/**
 * Create a list view for multiple profiles
 */
export const toProfileListView = createListView<PrivateProfile, ProfileView>(
  toProfileView,
);
