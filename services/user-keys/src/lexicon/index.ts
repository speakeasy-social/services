import { getPublicKeyDef, getPrivateKeyDef, rotateKeyDef, keyDef } from './types/key.js';

export const lexicons = [
  getPublicKeyDef,
  getPrivateKeyDef,
  rotateKeyDef,
  keyDef
];

export type LexiconDefs = typeof lexicons; 