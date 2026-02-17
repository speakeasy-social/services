import {
  authorize,
  RequestHandler,
  RequestHandlerReturn,
  ExtendedRequest,
  validateAgainstLexicon,
  User,
  getSessionDid,
} from '@speakeasy-services/common';
import {
  getPostsDef,
  createPostsDef,
  getPostThreadDef,
  deletePostDef,
} from '../lexicon/types/posts.js';
import {
  toEncryptedPostsListView,
  toEncryptedPostView,
} from '../views/private-posts.views.js';
import { toSessionKeyListView } from '@speakeasy-services/session-management';
import {
  getDIDFromUri,
  PrivatePostsService,
} from '../services/privatePosts.service.js';
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

    const { uris, authors, replyTo, limit, cursor, filter, hasReplies, hasMedia } = validatedQuery;

    // Convert limit to number if provided
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    const userDid = getSessionDid(req);
    const result = await privatePostsService.getPosts(
      req,
      userDid,
      {
        authorDids: authors,
        uris,
        replyTo,
        limit: limitNum,
        cursor,
        filter,
        hasReplies,
        hasMedia,
      },
    );

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

  'social.spkeasy.privatePost.getPostThread': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    const validatedQuery = validateAgainstLexicon(getPostThreadDef, req.query);

    const { uri, limit } = validatedQuery;

    // Convert limit to number if provided
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    const userDid = getSessionDid(req);
    const result = await privatePostsService.getPostThread(
      req,
      userDid,
      {
        uri,
        limit: limitNum,
      },
    );

    result.encryptedPost &&
      authorize(req, 'list', 'private_post', result.encryptedPost);
    authorize(req, 'list', 'private_post', result.encryptedReplyPosts);
    result.encryptedParentPosts &&
      authorize(req, 'list', 'private_post', result.encryptedParentPosts);
    authorize(req, 'list', 'session_key', result.encryptedSessionKeys);

    return {
      body: {
        // FIXME: Send cursor if there are more replies
        cursor: null,

        encryptedPost: toEncryptedPostView(result.encryptedPost),
        encryptedReplyPosts: toEncryptedPostsListView(
          result.encryptedReplyPosts,
        ),
        encryptedParentPosts: toEncryptedPostsListView(
          result.encryptedParentPosts,
        ),
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

    const userDid = getSessionDid(req);
    authorize(req, 'create', 'private_post', {
      authorDid: userDid,
    });

    const user = req.user as User;

    await privatePostsService.createEncryptedPosts(
      userDid,
      user.handle,
      user.token,
      req.body,
    );

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
    const validatedBody = validateAgainstLexicon(deletePostDef, req.body);

    const authorDid = getDIDFromUri(validatedBody.uri);

    authorize(req, 'delete', 'private_post', {
      authorDid,
    });

    await privatePostsService.deletePost(validatedBody.uri);

    return {
      body: { success: true },
    };
  },
  'social.spkeasy.privatePost.preAuth': async (
    _req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // NOOP
    // This route is called to cause the user's bluesky session
    // to be cached so the initial request to getPosts is faster
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
  'social.spkeasy.privatePost.getPostThread': {
    handler: methodHandlers['social.spkeasy.privatePost.getPostThread'],
  },
  'social.spkeasy.privatePost.createPosts': {
    handler: methodHandlers['social.spkeasy.privatePost.createPosts'],
  },
  'social.spkeasy.privatePost.deletePost': {
    handler: methodHandlers['social.spkeasy.privatePost.deletePost'],
  },
  'social.spkeasy.privatePost.preAuth': {
    handler: methodHandlers['social.spkeasy.privatePost.preAuth'],
  },
};

type MethodName = keyof typeof methodHandlers;
