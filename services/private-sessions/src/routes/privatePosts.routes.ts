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
   * The posts can be filtered in the following ways:
   * - author= Specific post authors (comma separated list of DIDs)
   * - replyTo= Posts in the thread for the given post URI
   * - filter= If follows, then limit the posts to those authored by user you follow
   *
   * @param req - The request containing recipient DIDs and pagination parameters
   * @returns Promise containing encrypted posts and session keys
   */
  'social.spkeasy.privatePost.getPosts': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    const validatedQuery = validateAgainstLexicon(getPostsDef, req.query);

    const { uris, authors, replyTo, limit, cursor, filter } = validatedQuery;

    // Convert limit to number if provided
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    const result = await privatePostsService.getPosts(req, req.user!.did!, {
      authorDids: authors,
      uris,
      replyTo,
      limit: limitNum,
      cursor,
      filter,
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
  'social.spkeasy.privatePost.preAuth': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // NOOP
    // This route is called to cause the user's bluesky session
    // to be cached so the initial request to getPorsts is faster
    return {
      body: { success: true },
    };
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
  'social.spkeasy.privatePost.deletePost': {
    handler: methodHandlers['social.spkeasy.privatePost.deletePost'],
  },
  'social.spkeasy.privatePost.preAuth': {
    handler: methodHandlers['social.spkeasy.privatePost.preAuth'],
  },
};

type MethodName = keyof typeof methodHandlers;
