import { getFeaturesDef, applyInviteCodeDef, donateDef } from './types/features.js';
import {
  createTestimonialDef,
  listTestimonialsDef,
  updateTestimonialDef,
  deleteTestimonialDef,
  checkContributionDef,
} from './types/testimonials.js';

export const lexicons = [
  getFeaturesDef,
  applyInviteCodeDef,
  donateDef,
  createTestimonialDef,
  listTestimonialsDef,
  updateTestimonialDef,
  deleteTestimonialDef,
  checkContributionDef,
];
