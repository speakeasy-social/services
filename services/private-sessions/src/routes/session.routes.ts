import { z } from 'zod';
import { SessionService } from '../services/session.service.js';
import { ValidationError } from '@speakeasy-services/common';
import { LexiconDoc } from '@atproto/lexicon';
import {
  XRPCHandlerConfig,
  XRPCReqContext,
  HandlerOutput,
} from '@atproto/xrpc-server';
import {
  authorize,
  RequestHandler,
  ExtendedRequest,
} from '@speakeasy-services/common';
import { lexicons } from '../lexicon/index.js';
import {
  revokeSessionDef,
  addUserDef,
  createSessionDef,
} from '../lexicon/types/session.js';
import {
  getPostsDef,
  createPostDef,
  deletePostDef,
} from '../lexicon/types/posts.js';

const sessionService = new SessionService();

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
  'social.spkeasy.privateSession.create': async (
    req: ExtendedRequest,
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    validateAgainstLexicon(createSessionDef, req.body);

    const { sessionKeys } = req.body;

    authorize(req, 'create', 'private_session', { authorDid: req.user.did });

    const result = await sessionService.createSession({
      authorDid: req.user.did!,
      sessionKeys,
    });
    return {
      encoding: 'application/json',
      body: { sessionId: result.sessionId },
    };
  },
  'social.spkeasy.privateSession.revoke': async (
    req: Request,
  ): Promise<HandlerOutput> => {
    const { sessionId } = req.body as { sessionId: string };

    // Validate input against lexicon
    validateAgainstLexicon(revokeSessionDef, req.body);

    const session = await sessionService.getSession(sessionId);
    authorize(req, 'revoke', 'private_session', { authorDid: req.user.did });

    const result = await sessionService.revokeSession(sessionId);
    return {
      encoding: 'application/json',
      body: { success: true },
    };
  },
  'social.spkeasy.privateSession.addUser': async (
    req: Request,
  ): Promise<HandlerOutput> => {
    const { sessionId, recipientDid } = ctx.params as {
      sessionId: string;
      recipientDid: string;
    };

    // Validate input against lexicon
    validateAgainstLexicon(addUserDef, { sessionId, recipientDid });

    const session = await sessionService.getSession(sessionId);
    authorize(req, 'create', 'private_session');

    const result = await sessionService.addRecipientToSession(
      sessionId,
      recipientDid,
    );
    return {
      encoding: 'application/json',
      body: { success: true },
    };
  },

  // Post management
  'social.spkeasy.privatePosts.getPosts': async (
    req: Request,
  ): Promise<HandlerOutput> => {
    const { recipient, limit, cursor } = ctx.params as {
      recipient: string;
      authors: string;
      limit?: string;
      cursor?: string;
    };

    // Convert limit to number if provided
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    // Validate input against lexicon
    validateAgainstLexicon(getPostsDef, { recipient, limit: limitNum, cursor });

    const result = await sessionService.getPosts({
      recipient,
      limit: limitNum,
      cursor,
    });

    // authorize(ctx.req, 'list', result);

    return {
      encoding: 'application/json',
      body: result,
    };
  },

  'social.spkeasy.privatePosts.createPost': async (
    req: Request,
  ): Promise<HandlerOutput> => {
    const lexicon = createPostDef.defs.main;

    const { sessionId, text } = ctx.params as {
      sessionId: string;
      encryptedPost: string;
    };

    // Validate input against lexicon
    validateAgainstLexicon(lexicon, { sessionId, text, recipients });

    authorize(ctx, 'create', session);

    const session = await sessionService.createEncryptedPost(
      sessionId,
      authorDid,
      encryptedPost,
    );
  },

  'social.spkeasy.privatePosts.deletePost': async (
    req: Request,
  ): Promise<HandlerOutput> => {
    const lexicon = deletePostDef.defs.main;
    const { uri } = ctx.params as { uri: string };

    // Validate input against lexicon
    validateAgainstLexicon(lexicon, { uri });

    const post = await sessionService.deletePost(uri);
    authorize(ctx, 'delete', post);
  },
} as const;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, XRPCHandlerConfig> = {
  // Session management methods
  'social.spkeasy.privateSession.create': {
    handler: methodHandlers['social.spkeasy.privateSession.create'],
  },
  'social.spkeasy.privateSession.revoke': {
    handler: methodHandlers['social.spkeasy.privateSession.revoke'],
  },
  'social.spkeasy.privateSession.addUser': {
    handler: methodHandlers['social.spkeasy.privateSession.addUser'],
  },

  // Post management methods
  'social.spkeasy.privatePosts.getPosts': {
    handler: methodHandlers['social.spkeasy.privatePosts.getPosts'],
  },
  'social.spkeasy.privatePosts.createPost': {
    handler: methodHandlers['social.spkeasy.privatePosts.createPost'],
  },
  'social.spkeasy.privatePosts.deletePost': {
    handler: methodHandlers['social.spkeasy.privatePosts.deletePost'],
  },
};

type MethodName = keyof typeof methodHandlers;
