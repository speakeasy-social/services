/**
 * TODO: This is a placeholder structure that will be replaced with Fastify XML-RPC endpoints
 * The actual implementation will use Fastify's XML-RPC plugin
 */

import { FastifyInstance } from 'fastify';
import { methods } from './trust.routes.js';
import { z } from 'zod';
import { ServiceError, ValidationError } from '@speakeasy-services/common/errors.js';

export async function registerRoutes(fastify: FastifyInstance) {
  // Register all methods with the XRPC server
  Object.entries(methods).forEach(([methodName, method]) => {
    fastify.post(`/xrpc/${methodName}`, {
      schema: {
        body: z.object({
          ...Object.entries(method.parameters).reduce((acc, [key, param]) => {
            if (param.type === 'array' && param.items?.type === 'string') {
              return {
                ...acc,
                [key]: z.array(z.string()),
              };
            }
            return {
              ...acc,
              [key]: param.type === 'number'
                ? z.number()
                : param.type === 'boolean'
                ? z.boolean()
                : z.string(),
            };
          }, {}),
        }),
      },
      handler: async (request, reply) => {
        try {
          const result = await method.handler(request.body);
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
