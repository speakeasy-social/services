import {
  getPublicKeyDef,
  getPrivateKeyDef,
  rotateKeyDef,
  keyDef,
  getPublicKeysDef,
} from './types/key.js';

export const lexicons = [
  getPublicKeyDef,
  getPrivateKeyDef,
  rotateKeyDef,
  keyDef,
  getPublicKeysDef,
];

export type LexiconDefs = typeof lexicons;
