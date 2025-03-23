/**
 * TODO: This is a placeholder structure that will be replaced with Fastify XML-RPC endpoints
 * The actual implementation will use Fastify's XML-RPC plugin
 */

import { FastifyInstance } from 'fastify';
import { registerRoutes } from './session.routes.js';

export async function registerAllRoutes(fastify: FastifyInstance) {
  await registerRoutes(fastify);
}
