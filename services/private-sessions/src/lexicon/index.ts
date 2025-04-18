import {
  revokeSessionDef,
  addUserDef,
  createSessionDef,
} from './types/session.js';
import {
  getPostsDef,
  createPostsDef,
  deletePostDef,
  privatePostDef,
} from './types/posts.js';

export const lexicons = [
  revokeSessionDef,
  addUserDef,
  createSessionDef,
  getPostsDef,
  createPostsDef,
  deletePostDef,
  privatePostDef,
];

export type LexiconDefs = typeof lexicons;
