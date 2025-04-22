import { z } from 'zod';
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
import { getPostsDef, createPostsDef } from '../lexicon/types/posts.js';
import { toEncryptedPostsListView } from '../views/private-posts.views.js';
import { toSessionKeyListView } from '../views/private-sessions.views.js';
import { PrivatePostsService } from '../services/privatePosts.service.js';

const privatePostsService = new PrivatePostsService();

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
  /**
   * Retrieves encrypted posts for specified recipients
   * @param req - The request containing recipient DIDs and pagination parameters
   * @returns Promise containing encrypted posts and session keys
   */
  'social.spkeasy.privatePosts.getPosts': async (
    req: ExtendedRequest,
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    validateAgainstLexicon(getPostsDef, req.query);

    const { authors, replyTo, limit, cursor } = req.query as {
      authors?: string;
      limit?: string;
      cursor?: string;
      replyTo?: string;
    };

    // Convert limit to number if provided
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    const result = await privatePostsService.getPosts(req.user.did!, {
      authorDids: authors?.split(','),
      replyPostCid: replyTo,
      limit: limitNum,
      cursor,
    });

    authorize(req, 'list', 'private_post', result.encryptedPosts);
    authorize(req, 'list', 'private_session', result.encryptedSessionKeys);

    return {
      encoding: 'application/json',
      body: {
        cursor: result.cursor,
        encryptedPosts: toEncryptedPostsListView(result.encryptedPosts),
        encryptedSessionKeys: toSessionKeyListView(result.encryptedSessionKeys),
      },
    };
  },

  /**
   * Creates new encrypted posts in a private session
   * @param req - The request containing the encrypted posts data
   * @returns Promise indicating success of post creation
   */
  'social.spkeasy.privatePosts.createPosts': async (
    req: ExtendedRequest,
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    validateAgainstLexicon(createPostsDef, req.body);

    authorize(req, 'create', 'private_post', { authorDid: req.user.did });

    await privatePostsService.createEncryptedPosts(req.user.did!, req.body);

    return {
      encoding: 'application/json',
      body: { success: true },
    };
  },

  /**
   * Deletes a specific encrypted post
   * @param req - The request containing the post URI to delete
   * @returns Promise indicating success of post deletion
   */
  'social.spkeasy.privatePosts.deletePost': async (
    req: ExtendedRequest,
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    // validateAgainstLexicon(lexicon, { uri });

    // authorize(ctx, 'delete', post);

    // const post = await sessionService.deletePost(uri);
    throw new Error('Not implemented');
  },
} as const;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, { handler: RequestHandler }> = {
  // Post management methods
  'social.spkeasy.privatePosts.getPosts': {
    handler: methodHandlers['social.spkeasy.privatePosts.getPosts'],
  },
  'social.spkeasy.privatePosts.createPosts': {
    handler: methodHandlers['social.spkeasy.privatePosts.createPosts'],
  },
  'social.spkeasy.privatePosts.deletePost': {
    handler: methodHandlers['social.spkeasy.privatePosts.deletePost'],
  },
};

type MethodName = keyof typeof methodHandlers;
