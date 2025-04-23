import {
  revokeSessionDef,
  addUserDef,
  createSessionDef,
} from './types/session.js';
import { getPostsDef, createPostsDef, deletePostDef } from './types/posts.js';

export const lexicons = [
  revokeSessionDef,
  addUserDef,
  createSessionDef,
  getPostsDef,
  createPostsDef,
  deletePostDef,
];

export type LexiconDefs = typeof lexicons;
