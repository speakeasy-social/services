import { Lexicons } from '@atproto/lexicon';
import { createSessionLexicons } from '@speakeasy-services/session-management';
import { profileLexicons } from './profile.js';

export const lexicons: Lexicons = {
  ...createSessionLexicons('social.spkeasy.profileSession'),
  ...profileLexicons,
};

export type LexiconDefs = typeof lexicons;
