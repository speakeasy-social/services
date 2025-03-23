/**
 * XRPC endpoints for key management
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { KeyServiceImpl } from '../services/key.service.js';
import { ServiceError, ValidationError, AuthorizationError } from '@speakeasy-services/common/errors.js';
import { MethodSchema, XRPCHandlerConfig, XRPCReqContext, HandlerOutput } from '@atproto/xrpc-server';
import { authorize, verifyAuth } from '@speakeasy-services/common';

const keyService = new KeyServiceImpl();

// Define method handlers
const methodHandlers = {
  'social.spkeasy.keys.getPublicKey': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { did } = ctx.params as { did: string };
    // Public key is publicly accessible
    const result = await keyService.getPublicKey(did);
    return {
      encoding: 'application/json',
      body: result
    };
  },
  'social.spkeasy.keys.getPrivateKey': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    // Only the owner can access their private key
    authorize(ctx.req, 'manage', 'keys', { did: ctx.req.user.did });
    const result = await keyService.getPrivateKey();
    return {
      encoding: 'application/json',
      body: result
    };
  },
  'social.spkeasy.keys.rotate': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    // Only the owner can rotate their keys
    authorize(ctx.req, 'manage', 'keys', { did: ctx.req.user.did });
    const result = await keyService.requestRotation();
    return {
      encoding: 'application/json',
      body: result
    };
  },
} as const;

type MethodName = keyof typeof methodHandlers;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, XRPCHandlerConfig> = {
  'social.spkeasy.keys.getPublicKey': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.keys.getPublicKey']
  },
  'social.spkeasy.keys.getPrivateKey': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.keys.getPrivateKey']
  },
  'social.spkeasy.keys.rotate': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.keys.rotate']
  }
};

export async function registerKeyRoutes(fastify: FastifyInstance) {
  // Register each method
  for (const [name, config] of Object.entries(methods)) {
    if (name in methodHandlers) {
      const methodName = name as MethodName;
      const handler = methodHandlers[methodName];
      fastify.route({
        method: 'POST',
        url: `/xrpc/${name}`,
        handler: async (request, reply) => {
          try {
            const result = await handler(request as unknown as XRPCReqContext);
            reply.send(result);
          } catch (error) {
            if (error instanceof ServiceError) {
              reply.status(error.statusCode).send({ error: error.message });
            } else {
              reply.status(500).send({ error: 'Internal server error' });
            }
          }
        }
      });
    }
  }
}
