import { revokeSessionDef, addUserDef } from './types/session.js';
import { getPostsDef, createPostDef, deletePostDef, privatePostDef } from './types/posts.js';

export const lexicons = [
  revokeSessionDef,
  addUserDef,
  getPostsDef,
  createPostDef,
  deletePostDef,
  privatePostDef
];

export type LexiconDefs = typeof lexicons; 