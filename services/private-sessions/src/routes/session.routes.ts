import { z } from 'zod';
import { SessionServiceImpl } from '../services/session.service.js';
import { ServiceError, ValidationError, NotFoundError, DatabaseError, AuthorizationError } from '@speakeasy-services/common';
import { LexiconDoc } from '@atproto/lexicon';
import { createServer, XRPCHandlerConfig, XRPCHandler, XRPCReqContext, HandlerOutput } from '@atproto/xrpc-server';
import { AppAbility, authorize, verifyAuth } from '@speakeasy-services/common';
import { lexicons } from '../lexicon/index.js';
import { revokeSessionDef, addUserDef } from '../lexicon/types/session.js';
import { getPostsDef, createPostDef, deletePostDef } from '../lexicon/types/posts.js';

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
    const { sessionId } = ctx.params as { sessionId: string };
    
    // Validate input against lexicon
    validateAgainstLexicon(revokeSessionDef, { sessionId });

    const session = await sessionService.getSession(sessionId);
    authorize(ctx.req, 'revoke', session);

    const result = await sessionService.revokeSession(sessionId);
    return {
      encoding: 'application/json',
      body: { success: true }
    };
  },
  'social.spkeasy.privateSession.addUser': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { sessionId, recipientDid } = ctx.params as { sessionId: string; recipientDid: string };
    
    // Validate input against lexicon
    validateAgainstLexicon(addUserDef, { sessionId, recipientDid });

    const session = await sessionService.getSession(sessionId);
    authorize(ctx.req, 'create', session);

    const result = await sessionService.addRecipientToSession(sessionId, recipientDid);
    return {
      encoding: 'application/json',
      body: { success: true }
    };
  },

  // Post management
  'social.spkeasy.privatePosts.getPosts': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { recipient, limit, cursor } = ctx.params as { recipient: string; limit?: string; cursor?: string };
    
    // Convert limit to number if provided
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    
    // Validate input against lexicon
    validateAgainstLexicon(getPostsDef, { recipient, limit: limitNum, cursor });

    const result = await sessionService.getPosts({ recipient, limit: limitNum, cursor });

    // authorize(ctx.req, 'list', result);

    return {
      encoding: 'application/json',
      body: result
    };
  },

  'social.spkeasy.privatePosts.createPost': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const lexicon = createPostDef.defs.main;
    const { sessionId, text, recipients } = ctx.params as { sessionId: string; text: string; recipients: string[] };
    
    // Validate input against lexicon
    validateAgainstLexicon(lexicon, { sessionId, text, recipients });

    const session = await sessionService.getSession(sessionId);
    authorize(ctx.req, 'create', session);

    // TODO: Implement create post logic
    throw new Error('Not implemented');
  },
  'social.spkeasy.privatePosts.deletePost': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const lexicon = deletePostDef.defs.main;
    const { uri } = ctx.params as { uri: string };
    
    // Validate input against lexicon
    validateAgainstLexicon(lexicon, { uri });

    const post = await sessionService.getPost(uri);
    authorize(ctx.req, 'delete', post);

    // TODO: Implement delete post logic
    throw new Error('Not implemented');
  }
} as const;

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

type MethodName = keyof typeof methodHandlers;
