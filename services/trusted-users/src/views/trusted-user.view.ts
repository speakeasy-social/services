import { TrustedUser } from '@prisma/client';
import { createView, createListView } from './view.js';

/**
 * Create a view that picks recipientDid and createdAt, converting createdAt to ISO string
 */
export const toTrustedUserView = createView<
  TrustedUser,
  { did: string; createdAt: string }
>(['recipientDid', 'createdAt'], {
  recipientDid: (value: string) => value,
  createdAt: (value: Date) => value.toISOString(),
});

/**
 * Create a list view that maps over the array
 */
export const toTrustedUsersListView = createListView<
  TrustedUser,
  { did: string; createdAt: string }
>(toTrustedUserView);
