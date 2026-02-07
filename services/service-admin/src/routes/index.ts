/**
 * Export the methods for use by the XRPC server
 */

import { methods as featureMethods } from './feature.routes.js';
import { methods as testimonialMethods } from './testimonials.routes.js';

export const methods = {
  ...featureMethods,
  ...testimonialMethods,
};
