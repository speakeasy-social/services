/**
 * TODO: This is a placeholder structure that will be replaced with Fastify XML-RPC endpoints
 * The actual implementation will use Fastify's XML-RPC plugin
 */

import { FastifyInstance } from 'fastify';
import { methods } from './trust.routes.js';
import { z } from 'zod';
import { ServiceError, ValidationError } from '@speakeasy-services/common';

export async function registerRoutes(fastify: FastifyInstance) {
  // Register all methods with the XRPC server
  Object.entries(methods).forEach(([methodName, method]) => {
    fastify.post(`/xrpc/${methodName}`, {
      handler: async (request: any, reply: any) => {
        try {
          const result = await method.handler(request as any);
          return reply.send(result);
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new ValidationError('Invalid parameters');
          }
          throw error;
        }
      },
    });
  });
}
