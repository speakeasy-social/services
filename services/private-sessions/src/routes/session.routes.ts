import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SessionServiceImpl } from '../services/session.service.js';
import { ServiceError, ValidationError, NotFoundError, DatabaseError, AuthorizationError } from '@speakeasy-services/common';
import { LexiconDoc } from '@atproto/lexicon';
import { createServer, XRPCHandlerConfig, XRPCHandler, XRPCReqContext, HandlerOutput } from '@atproto/xrpc-server';
import { AppAbility, authorize, verifyAuth } from '@speakeasy-services/common';
import { lexicons } from '../lexicon/index.js';

const sessionService = new SessionServiceImpl();

// Helper function to validate against lexicon schema
function validateAgainstLexicon(lexicon: any, params: any) {
  const schema = lexicon.defs.main.parameters;
  if (!schema) return;

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (params[field] === undefined) {
        throw new ValidationError(`${field} is required`);
      }
    }
  }

  // Check field types
  if (schema.properties) {
    for (const [field, def] of Object.entries(schema.properties)) {
      const value = params[field];
      if (value === undefined) continue;

      const type = (def as any).type;
      if (type === 'string' && typeof value !== 'string') {
        throw new ValidationError(`${field} must be a string`);
      } else if (type === 'number' && typeof value !== 'number') {
        throw new ValidationError(`${field} must be a number`);
      } else if (type === 'boolean' && typeof value !== 'boolean') {
        throw new ValidationError(`${field} must be a boolean`);
      } else if (type === 'array' && !Array.isArray(value)) {
        throw new ValidationError(`${field} must be an array`);
      }
    }
  }
}

// Define method handlers with lexicon validation
const methodHandlers = {
  // Session management
  'social.spkeasy.privateSession.revoke': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const lexicon = lexicons.revoke;
    const { sessionId } = ctx.params as { sessionId: string };
    
    // Validate input against lexicon
    validateAgainstLexicon(lexicon, { sessionId });

    const session = await sessionService.getSession(sessionId);
    authorize(ctx.req, 'revoke', session);

    const result = await sessionService.revokeSession(sessionId);
    return {
      encoding: 'application/json',
      body: { success: true }
    };
  },
  'social.spkeasy.privateSession.addUser': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const lexicon = lexicons.addUser;
    const { sessionId, did } = ctx.params as { sessionId: string; did: string };
    
    // Validate input against lexicon
    validateAgainstLexicon(lexicon, { sessionId, did });

    const session = await sessionService.getSession(sessionId);
    authorize(ctx.req, 'create', session);

    const result = await sessionService.addUser(sessionId, did);
    return {
      encoding: 'application/json',
      body: { success: true }
    };
  },

  // Post management
  'social.spkeasy.privatePosts.getPosts': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const lexicon = lexicons.getPosts;
    const { recipient, limit, cursor } = ctx.params as { recipient: string; limit?: number; cursor?: string };
    
    // Validate input against lexicon
    validateAgainstLexicon(lexicon, { recipient, limit, cursor });

    const result = await sessionService.getPosts({ recipient, limit, cursor });
    authorize(ctx.req, 'list', result);

    return {
      encoding: 'application/json',
      body: result
    };
  },

  'social.spkeasy.privatePosts.createPost': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const lexicon = lexicons.createPost;
    const { sessionId, text, recipients } = ctx.params as { sessionId: string; text: string; recipients: string[] };
    
    // Validate input against lexicon
    validateAgainstLexicon(lexicon, { sessionId, text, recipients });

    const session = await sessionService.getSession(sessionId);
    authorize(ctx.req, 'create', session);

    // TODO: Implement create post logic
    throw new Error('Not implemented');
  },
  'social.spkeasy.privatePosts.deletePost': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const lexicon = lexicons.deletePost;
    const { uri } = ctx.params as { uri: string };
    
    // Validate input against lexicon
    validateAgainstLexicon(lexicon, { uri });

    const post = await sessionService.getPost(uri);
    authorize(ctx.req, 'delete', post);

    // TODO: Implement delete post logic
    throw new Error('Not implemented');
  }
} as const;

type MethodName = keyof typeof methodHandlers;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, XRPCHandlerConfig> = {
  // Session management methods
  'social.spkeasy.privateSession.revoke': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.privateSession.revoke']
  },
  'social.spkeasy.privateSession.addUser': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.privateSession.addUser']
  },

  // Post management methods
  'social.spkeasy.privatePosts.getPosts': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.privatePosts.getPosts']
  },
  'social.spkeasy.privatePosts.createPost': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.privatePosts.createPost']
  },
  'social.spkeasy.privatePosts.deletePost': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.privatePosts.deletePost']
  }
};

// Register routes with Fastify
export const registerRoutes = async (fastify: FastifyInstance) => {
  // Register each method
  for (const [name, config] of Object.entries(methods)) {
    if (name in methodHandlers) {
      const methodName = name as MethodName;
      const handler = methodHandlers[methodName];
      const lexicon = lexicons[methodName];
      
      fastify.route({
        method: 'POST',
        url: `/xrpc/${name}`,
        handler: async (request, reply) => {
          try {
            const result = await handler(request as unknown as XRPCReqContext);
            reply.send(result);
          } catch (error) {
            if (error instanceof ServiceError) {
              reply.status(400).send({ error: error.message });
            } else {
              reply.status(500).send({ error: 'Internal server error' });
            }
          }
        }
      });
    }
  }
};
