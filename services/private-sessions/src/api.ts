import { Server } from '@speakeasy-services/service-base';
import config from './config.js';
import { methods } from './routes/session.routes.js';
import { authorizationMiddleware } from '@speakeasy-services/common';
import { lexicons } from './lexicon/index.js';

const server = new Server({
  name: 'private-sessions',
  port: config.PORT,
  methods,
  middleware: [authorizationMiddleware],
  lexicons
});

server.start();
