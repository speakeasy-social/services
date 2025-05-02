import { Server } from '@speakeasy-services/service-base';
import config from './config.js';
import { methods } from './routes/index.js';
import {
  authorizationMiddleware,
  authenticateToken,
} from '@speakeasy-services/common';
import { lexicons } from './lexicon/index.js';
import { Queue } from '@speakeasy-services/queue';
import { healthCheck } from './health.js';
import {
  queryTrackerMiddleware,
  getTotalQueryDuration,
  getQueryDurationProfile,
  cleanupQueryTracking,
} from './db.js';

// Custom type to extend ServerOptions with our dbMetrics
type PrivateSessionsServerOptions = {
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
  name: 'private-sessions',
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
} as PrivateSessionsServerOptions);

// Initialize and start the queue before starting the server
Queue.start()
  .then(() => {
    server.start();
  })
  .catch((error) => {
    console.error('Error starting queue', error);
    process.exit(1);
  });
