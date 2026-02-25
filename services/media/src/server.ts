import { Server } from '@speakeasy-services/service-base';
import config from './config.js';
import { methods } from './routes/media.routes.js';
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

// Custom type to extend ServerOptions with our dbMetrics
type MediaServerOptions = {
  name: string;
  port: number;
  methods: Record<string, { handler: any }>;
  middleware?: any[];
  lexicons?: any[];
  healthCheck: () => Promise<void>;
  dbMetrics: {
    getTotalQueryDuration: typeof getTotalQueryDuration;
    getQueryDurationProfile: typeof getQueryDurationProfile;
    cleanupQueryTracking: typeof cleanupQueryTracking;
  };
};

const server = new Server({
  name: 'media',
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
} as MediaServerOptions);

export default server;
