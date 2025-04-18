import {
  getPublicKeyDef,
  getPrivateKeyDef,
  rotateKeyDef,
  getPublicKeysDef,
} from './types/key.js';

export const lexicons = [
  getPublicKeyDef,
  getPrivateKeyDef,
  rotateKeyDef,
  getPublicKeysDef,
];

export type LexiconDefs = typeof lexicons;
