import express from 'express';
import { Server } from '@speakeasy-services/service-base';
import config from './config.js';
import { methods } from './routes/index.js';
import {
  optionalAuthorizationMiddleware,
  optionalAuthenticateToken,
} from '@speakeasy-services/common';
import { lexicons } from './lexicon/index.js';
import { healthCheck } from './health.js';
import { handleStripeWebhook } from './routes/webhook.routes.js';

const server = new Server({
  name: 'service-admin',
  port: config.PORT,
  methods,
  middleware: [optionalAuthenticateToken, optionalAuthorizationMiddleware],
  lexicons,
  healthCheck,
});

// Register Stripe webhook route with raw body parsing (required for signature verification)
server.express.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

export default server;
