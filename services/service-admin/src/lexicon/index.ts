import { getFeaturesDef, applyInviteCodeDef, donateDef } from './types/features.js';
import {
  createTestimonialDef,
  listTestimonialsDef,
  deleteTestimonialDef,
  checkSupporterDef,
} from './types/testimonials.js';

export const lexicons = [
  getFeaturesDef,
  applyInviteCodeDef,
  donateDef,
  createTestimonialDef,
  listTestimonialsDef,
  deleteTestimonialDef,
  checkSupporterDef,
];
