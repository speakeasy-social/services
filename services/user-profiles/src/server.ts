import fastify from 'fastify';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

export async function createServer() {
  const server = fastify({
    logger,
  });

  // Register plugins
  // TODO: Add XRPC plugin

  // Register routes
  // TODO: Add routes

  // Error handler
  server.setErrorHandler((error, request, reply) => {
    logger.error(error);
    reply.status(500).send({ error: 'Internal Server Error' });
  });

  return server;
}
