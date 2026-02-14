import { Server, ServerOptions } from '@speakeasy-services/service-base';
import config from './config.js';
import { methods } from './routes/index.js';
import {
  authorizationMiddleware,
  authenticateToken,
} from '@speakeasy-services/common';
import { lexicons } from './lexicon/index.js';
import { healthCheck } from './health.js';
import {
  queryTrackerMiddleware,
  getTotalQueryDuration,
  getQueryDurationProfile,
  cleanupQueryTracking,
} from './db.js';

type PrivateProfilesServerOptions = ServerOptions & {
  dbMetrics: {
    getTotalQueryDuration: typeof getTotalQueryDuration;
    getQueryDurationProfile: typeof getQueryDurationProfile;
    cleanupQueryTracking: typeof cleanupQueryTracking;
  };
};

const server = new Server({
  name: 'private-profiles',
  port: config.PORT,
  methods,
  middleware: [
    queryTrackerMiddleware,
    authenticateToken,
    authorizationMiddleware,
  ],
  lexicons,
  healthCheck,
  dbMetrics: {
    getTotalQueryDuration,
    getQueryDurationProfile,
    cleanupQueryTracking,
  },
} as PrivateProfilesServerOptions);

export default server;
