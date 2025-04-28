import {
  createView,
  createListView,
  safeBtoa,
} from '@speakeasy-services/common';

type PublicKeyResponse = {
  id: string;
  publicKey: Uint8Array;
  authorDid: string;
};

type PrivateKeyResponse = {
  id: string;
  privateKey: Uint8Array;
  authorDid: string;
};

export type PublicKeyView = {
  userKeyPairId: string;
  publicKey: string;
  recipientDid: string;
};

export type PrivateKeyView = {
  userKeyPairId: string;
  privateKey: string;
  authorDid: string;
};

/**
 * Create a view that picks public key fields and converts binary data to base64
 */
export const toPublicKeyView = (key: PublicKeyResponse): PublicKeyView => ({
  publicKey: safeBtoa(key.publicKey),
  recipientDid: key.authorDid,
  userKeyPairId: key.id,
});

/**
 * Create a list view that maps over the array
 */
export const toPublicKeyListView = createListView<
  PublicKeyResponse,
  PublicKeyView
>(toPublicKeyView);

/**
 * Create a view that picks private key fields and converts binary data to base64
 */
export const toPrivateKeyView = (key: PrivateKeyResponse): PrivateKeyView => ({
  userKeyPairId: key.id,
  privateKey: safeBtoa(key.privateKey),
  authorDid: key.authorDid,
});

/**
 * Create a list view that maps over the array
 */
export const toPrivateKeyListView = createListView<
  PrivateKeyResponse,
  PrivateKeyView
>(toPrivateKeyView);
