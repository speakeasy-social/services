import { Server } from '@speakeasy-services/service-base';
import { config } from './config.js';
import { methods } from './routes/trust.routes.js';
import { authorizationMiddleware } from '@speakeasy-services/common';
import { lexicons } from './lexicon/index.js';

const server = new Server({
  name: 'trusted-users',
  port: config.TRUSTED_USERS_PORT,
  methods,
  middleware: [authorizationMiddleware],
  lexicons
});

server.start();
