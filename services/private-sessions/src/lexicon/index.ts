import {
  revokeSessionDef,
  addUserDef,
  createSessionDef,
} from './types/session.js';
import {
  getPostsDef,
  createPostDef,
  deletePostDef,
  privatePostDef,
} from './types/posts.js';

export const lexicons = [
  revokeSessionDef,
  addUserDef,
  createSessionDef,
  getPostsDef,
  createPostDef,
  deletePostDef,
  privatePostDef,
];

export type LexiconDefs = typeof lexicons;
