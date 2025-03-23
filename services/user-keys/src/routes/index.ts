/**
 * TODO: This is a placeholder structure that will be replaced with Fastify XML-RPC endpoints
 * The actual implementation will use Fastify's XML-RPC plugin
 */

import { FastifyInstance } from 'fastify';
import { registerKeyRoutes } from './key.routes.js';

export async function registerRoutes(fastify: FastifyInstance) {
  await registerKeyRoutes(fastify);
}
