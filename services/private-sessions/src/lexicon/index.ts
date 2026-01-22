import { createSessionLexicons } from '@speakeasy-services/session-management';
import { getPostsDef, createPostsDef, deletePostDef } from './types/posts.js';

// Get session lexicons as an array
const sessionLexiconsArray = Object.values(
  createSessionLexicons('social.spkeasy.privateSession'),
);

export const lexicons = [
  ...sessionLexiconsArray,
  getPostsDef,
  createPostsDef,
  deletePostDef,
];

export type LexiconDefs = typeof lexicons;
