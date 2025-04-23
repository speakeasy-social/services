import {
  revokeSessionDef,
  addUserDef,
  createSessionDef,
  updateSessionKeysDef,
} from './types/session.js';
import { getPostsDef, createPostsDef, deletePostDef } from './types/posts.js';

export const lexicons = [
  revokeSessionDef,
  addUserDef,
  createSessionDef,
  updateSessionKeysDef,
  getPostsDef,
  createPostsDef,
  deletePostDef,
];

export type LexiconDefs = typeof lexicons;
