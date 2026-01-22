import { createSessionLexicons } from '@speakeasy-services/session-management';
import {
  getProfileDef,
  getProfilesDef,
  profileViewDef,
  putProfileDef,
  deleteProfileDef,
} from './types/profile.js';

// Get session lexicons as an array
const sessionLexiconsArray = Object.values(
  createSessionLexicons('social.spkeasy.profileSession'),
);

export const lexicons = [
  ...sessionLexiconsArray,
  getProfileDef,
  getProfilesDef,
  profileViewDef,
  putProfileDef,
  deleteProfileDef,
];

export type LexiconDefs = typeof lexicons;
