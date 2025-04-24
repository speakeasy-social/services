import {
  authorize,
  RequestHandler,
  RequestHandlerReturn,
  ExtendedRequest,
  validateAgainstLexicon,
} from '@speakeasy-services/common';
import { getPostsDef, createPostsDef } from '../lexicon/types/posts.js';
import { toEncryptedPostsListView } from '../views/private-posts.views.js';
import { toSessionKeyListView } from '../views/private-sessions.views.js';
import { PrivatePostsService } from '../services/privatePosts.service.js';
const privatePostsService = new PrivatePostsService();

// Define method handlers with lexicon validation
const methodHandlers = {
  /**
   * Retrieves encrypted posts for specified recipients
   *
   * Three options
   * - Get posts by people you follow (by author)
   * - Get posts by people who trust you (author omitted)
   * - Get posts by thread (replyTo)
   *
   * @param req - The request containing recipient DIDs and pagination parameters
   * @returns Promise containing encrypted posts and session keys
   */
  'social.spkeasy.privatePost.getPosts': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    const validatedQuery = validateAgainstLexicon(getPostsDef, req.query);

    const { authors, replyTo, limit, cursor } = validatedQuery;

    // Convert limit to number if provided
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    const result = await privatePostsService.getPosts(req.user!.did!, {
      authorDids: authors?.split(','),
      replyTo,
      limit: limitNum,
      cursor,
    });

    authorize(req, 'list', 'private_post', result.encryptedPosts);
    authorize(req, 'list', 'session_key', result.encryptedSessionKeys);

    return {
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
  'social.spkeasy.privatePost.createPosts': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(createPostsDef, req.body);

    authorize(req, 'create', 'private_post', { authorDid: req.user?.did });

    await privatePostsService.createEncryptedPosts(req.user!.did!, req.body);

    return {
      body: { success: true },
    };
  },

  /**
   * Deletes a specific encrypted post
   * @param req - The request containing the post URI to delete
   * @returns Promise indicating success of post deletion
   */
  'social.spkeasy.privatePost.deletePost': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
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
  'social.spkeasy.privatePost.getPosts': {
    handler: methodHandlers['social.spkeasy.privatePost.getPosts'],
  },
  'social.spkeasy.privatePost.createPosts': {
    handler: methodHandlers['social.spkeasy.privatePost.createPosts'],
  },
  'social.spkeasy.privatePost.deletePost': {
    handler: methodHandlers['social.spkeasy.privatePost.deletePost'],
  },
};

type MethodName = keyof typeof methodHandlers;
