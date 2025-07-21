import { Server } from '@speakeasy-services/service-base';
import config from './config.js';
import { methods } from './routes/key.routes.js';
import {
  authorizationMiddleware,
  authenticateToken,
} from '@speakeasy-services/common';
import { lexicons } from './lexicon/index.js';
import { healthCheck } from './health.js';

const server = new Server({
  name: 'user-keys',
  port: config.PORT,
  methods,
  middleware: [authenticateToken, authorizationMiddleware],
  lexicons,
  healthCheck,
});

export default server;