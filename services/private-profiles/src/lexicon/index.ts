import { createSessionLexicons } from '@speakeasy-services/session-management';
import {
  getProfileDef,
  profileViewDef,
  putProfileDef,
} from './types/profile.js';

// Get session lexicons as an array
const sessionLexiconsArray = Object.values(
  createSessionLexicons('social.spkeasy.profileSession'),
);

export const lexicons = [
  ...sessionLexiconsArray,
  getProfileDef,
  profileViewDef,
  putProfileDef,
];

export type LexiconDefs = typeof lexicons;
