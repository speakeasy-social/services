import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SessionServiceImpl } from '../services/session.service.js';
import { ServiceError, ValidationError, NotFoundError, DatabaseError, AuthorizationError } from '@speakeasy-services/common';
import { LexiconDoc } from '@atproto/lexicon';
import { createServer, XRPCHandlerConfig, XRPCHandler, XRPCReqContext, HandlerOutput, AuthVerifier, AuthVerifierContext, AuthOutput } from '@atproto/xrpc-server';
import { AppAbility, authorize } from '@speakeasy-services/common';

const sessionService = new SessionServiceImpl();

// Auth verifier function
const verifyAuth: AuthVerifier = async (ctx: AuthVerifierContext): Promise<AuthOutput> => {
  // TODO: Implement proper auth verification
  return {
    credentials: {
      did: 'test-did',
      handle: 'test-handle'
    }
  };
};

// Define method handlers
const methodHandlers = {
  // Session management
  'social.speakeasy.private_sessions.revoke': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { sessionId } = ctx.params as { sessionId: string };
    const session = await sessionService.getSession(sessionId);
    authorize(ctx.req, 'revoke', 'private_session', { authorDid: session.authorDid });

    const result = await sessionService.revokeSession(sessionId);
    return {
      encoding: 'application/json',
      body: result
    };
  },
  'social.speakeasy.private_sessions.add_user': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { sessionId, did } = ctx.params as { sessionId: string; did: string };
    const session = await sessionService.getSession(sessionId);
    authorize(ctx.req, 'create', 'private_session', { authorDid: session.authorDid });

    const result = await sessionService.addUser(sessionId, did);
    return {
      encoding: 'application/json',
      body: result
    };
  },

  // Post management
  'social.speakeasy.private_posts.get_posts': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { recipient, limit, cursor } = ctx.params as { recipient: string; limit?: number; cursor?: string };
    authorize(ctx.req, 'list', 'private_post', { recipientDid: recipient });

    const result = await sessionService.getPosts({ recipient, limit, cursor });
    return {
      encoding: 'application/json',
      body: result
    };
  },
  'social.speakeasy.private_posts.get_bulk': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { postIds } = ctx.params as { postIds: string[] };
    const posts = await sessionService.getPostsByIds(postIds);
    authorize(ctx.req, 'list', 'private_post', { recipientDid: ctx.req.user.did });

    const result = await sessionService.getBulk(postIds);
    return {
      encoding: 'application/json',
      body: result
    };
  },
  'social.speakeasy.private_posts.create': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { sessionId, text, recipients } = ctx.params as { sessionId: string; text: string; recipients: string[] };
    const session = await sessionService.getSession(sessionId);
    authorize(ctx.req, 'createPost', 'post', { authorDid: session.authorDid });

    // TODO: Implement create post logic
    throw new Error('Not implemented');
  },
  'social.speakeasy.private_posts.delete': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { uri } = ctx.params as { uri: string };
    const post = await sessionService.getPost(uri);
    authorize(ctx.req, 'deletePost', 'post', { authorDid: post.authorDid });

    // TODO: Implement delete post logic
    throw new Error('Not implemented');
  }
} as const;

type MethodName = keyof typeof methodHandlers;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, XRPCHandlerConfig> = {
  // Session management methods
  'social.speakeasy.private_sessions.revoke': {
    auth: verifyAuth,
    handler: methodHandlers['social.speakeasy.private_sessions.revoke']
  },
  'social.speakeasy.private_sessions.add_user': {
    auth: verifyAuth,
    handler: methodHandlers['social.speakeasy.private_sessions.add_user']
  },

  // Post management methods
  'social.speakeasy.private_posts.get_posts': {
    auth: verifyAuth,
    handler: methodHandlers['social.speakeasy.private_posts.get_posts']
  },
  'social.speakeasy.private_posts.get_bulk': {
    auth: verifyAuth,
    handler: methodHandlers['social.speakeasy.private_posts.get_bulk']
  },
  'social.speakeasy.private_posts.create': {
    auth: verifyAuth,
    handler: methodHandlers['social.speakeasy.private_posts.create']
  },
  'social.speakeasy.private_posts.delete': {
    auth: verifyAuth,
    handler: methodHandlers['social.speakeasy.private_posts.delete']
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
        url: `/${name}`,
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
