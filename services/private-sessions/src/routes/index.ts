/**
 * Export the methods for use by the XRPC server
 */

import { methods as sessionMethods } from './session.routes.js';
import { methods as privatePostsMethods } from './privatePosts.routes.js';
import { methods as featuresMethods } from './features.routes.js';

export const methods = {
  ...sessionMethods,
  ...privatePostsMethods,
  ...featuresMethods,
};
