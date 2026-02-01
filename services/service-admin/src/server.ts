import { Server } from '@speakeasy-services/service-base';
import config from './config.js';
import { methods } from './routes/index.js';
import {
  optionalAuthorizationMiddleware,
  optionalAuthenticateToken,
} from '@speakeasy-services/common';
import { lexicons } from './lexicon/index.js';
import { healthCheck } from './health.js';
const server = new Server({
  name: 'service-admin',
  port: config.PORT,
  methods,
  middleware: [optionalAuthenticateToken, optionalAuthorizationMiddleware],
  lexicons,
  healthCheck,
});

export default server;
