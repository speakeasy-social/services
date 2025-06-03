/**
 * Export the methods for use by the XRPC server
 */

import { methods as sessionMethods } from './session.routes.js';
import { methods as profileMethods } from './profile.routes.js';

export const methods = {
  ...sessionMethods,
  ...profileMethods,
};

export { methods as profileSessionMethods } from './session.routes.js';
export { methods as profileMethods } from './profile.routes.js';
