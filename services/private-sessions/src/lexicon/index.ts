import { privateSessionDefs } from './types/session.js';
import { privatePostsDefs } from './types/posts.js';

export const lexicons = {
  ...privateSessionDefs,
  ...privatePostsDefs
} as const;

export type LexiconDefs = typeof lexicons; 