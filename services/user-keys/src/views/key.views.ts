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
  id: string;
  publicKey: string;
  authorDid: string;
};

export type PrivateKeyView = {
  id: string;
  privateKey: string;
  authorDid: string;
};

/**
 * Create a view that picks public key fields and converts binary data to base64
 */
export const toPublicKeyView = createView<PublicKeyResponse, PublicKeyView>(
  ['id', 'publicKey', 'authorDid'],
  {
    id: (value: string) => value,
    publicKey: (value: Uint8Array) => safeBtoa(value),
    authorDid: (value: string) => value,
  },
);

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
export const toPrivateKeyView = createView<PrivateKeyResponse, PrivateKeyView>(
  ['id', 'privateKey', 'authorDid'],
  {
    id: (value: string) => value,
    privateKey: (value: Uint8Array) => safeBtoa(value),
    authorDid: (value: string) => value,
  },
);
