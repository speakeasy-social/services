import { Server } from '@speakeasy-services/service-base';
import config from './config.js';
import { methods } from './routes/key.routes.js';
import {
  authorizationMiddleware,
  authenticateToken,
} from '@speakeasy-services/common';
import { lexicons } from './lexicon/index.js';

const server = new Server({
  name: 'user-keys',
  port: config.PORT,
  methods,
  middleware: [authenticateToken, authorizationMiddleware],
  lexicons,
});

server.start().catch((error: Error) => {
  console.error({ error }, 'Failed to start server');
  process.exit(1);
});
