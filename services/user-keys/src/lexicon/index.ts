import {
  getPublicKeyDef,
  getPrivateKeyDef,
  rotateKeyDef,
  getPublicKeysDef,
  getPrivateKeysDef,
} from './types/key.js';

export const lexicons = [
  getPublicKeyDef,
  getPrivateKeyDef,
  rotateKeyDef,
  getPublicKeysDef,
  getPrivateKeysDef,
];

export type LexiconDefs = typeof lexicons;
