/**
 * XRPC method definitions for trust management
 */

import { TrustService } from '../services/trust.service.js';
import { MethodSchema, XRPCHandlerConfig, XRPCReqContext, HandlerOutput } from '@atproto/xrpc-server';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ServiceError, ValidationError, AuthorizationError } from '@speakeasy-services/common/errors.js';
import { authorize, verifyAuth } from '@speakeasy-services/common';

const trustService = new TrustService();

// Define method handlers
const methodHandlers = {
  'social.spkeasy.graph.getTrusts': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { did } = ctx.params as { did: string };
    // Anyone can see who trusts a DID
    const result = await trustService.getTrustedBy(did);
    return {
      encoding: 'application/json',
      body: result
    };
  },
  'social.spkeasy.graph.addTrusted': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { did } = ctx.params as { did: string };
    // Only the author can add trusted users
    authorize(ctx.req, 'manage', 'trust', { authorDid: ctx.req.user.did });
    const result = await trustService.addTrusted(did);
    return {
      encoding: 'application/json',
      body: result
    };
  },
  'social.spkeasy.graph.removeTrusted': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { did } = ctx.params as { did: string };
    // Only the author can remove trusted users
    authorize(ctx.req, 'manage', 'trust', { authorDid: ctx.req.user.did });
    const result = await trustService.removeTrusted(did);
    return {
      encoding: 'application/json',
      body: result
    };
  },
} as const;

type MethodName = keyof typeof methodHandlers;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, XRPCHandlerConfig> = {
  'social.spkeasy.graph.getTrusts': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.graph.getTrusts']
  },
  'social.spkeasy.graph.addTrusted': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.graph.addTrusted']
  },
  'social.spkeasy.graph.removeTrusted': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.graph.removeTrusted']
  }
};

// Register routes with Fastify
export const registerRoutes = async (fastify: FastifyInstance) => {
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
};
