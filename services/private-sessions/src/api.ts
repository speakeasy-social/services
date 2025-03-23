import { Server } from '@speakeasy-services/service-base';
import { config } from './config.js';
import { methods } from './routes/session.routes.js';
import { authorizationMiddleware } from '@speakeasy-services/common';

const server = new Server({
  name: 'private-sessions',
  port: config.PRIVATE_SESSIONS_PORT,
  methods,
  middleware: [authorizationMiddleware]
});

server.start();
