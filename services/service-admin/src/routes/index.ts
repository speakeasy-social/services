/**
 * Export the methods for use by the XRPC server
 */

import { methods as featureMethods } from './feature.routes.js';

export const methods = {
  ...featureMethods,
};
