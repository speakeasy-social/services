/**
 * XRPC endpoints for key management
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { KeyServiceImpl } from '../services/key.service.js';
import { ServiceError, ValidationError } from '@speakeasy-services/common/errors.js';
import { MethodSchema } from '@atproto/xrpc-server';

const keyService = new KeyServiceImpl();

// Define methods using XRPC lexicon
const methods: Record<string, MethodSchema> = {
  'social.speakeasy.keys.get_public_key': {
    description: 'Get user\'s public key for encryption',
    parameters: {
      did: { type: 'string', required: true },
    },
    handler: async (params: { did: string }) => {
      return await keyService.getPublicKey(params.did);
    },
  },
  'social.speakeasy.keys.get_private_key': {
    description: 'Get user\'s private key (owner only)',
    parameters: {},
    handler: async () => {
      return await keyService.getPrivateKey();
    },
  },
  'social.speakeasy.keys.request_rotation': {
    description: 'Request key rotation',
    parameters: {},
    handler: async () => {
      return await keyService.requestRotation();
    },
  },
};

export async function registerKeyRoutes(fastify: FastifyInstance) {
  // Register all methods with the XRPC server
  Object.entries(methods).forEach(([methodName, method]) => {
    fastify.post(`/xrpc/${methodName}`, {
      schema: {
        body: z.object({
          ...Object.entries(method.parameters).reduce((acc, [key, param]) => ({
            ...acc,
            [key]: param.type === 'array'
              ? z.array(z.string())
              : param.type === 'number'
              ? z.number()
              : z.string(),
          }), {}),
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
