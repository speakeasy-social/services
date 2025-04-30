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

const server = new Server({
  name: 'private-sessions',
  port: config.PORT,
  methods,
  middleware: [authenticateToken, authorizationMiddleware],
  lexicons,
  healthCheck,
});

// Initialize and start the queue before starting the server
Queue.start()
  .then(() => {
    server.start();
  })
  .catch((error) => {
    console.error('Error starting queue', error);
    process.exit(1);
  });
