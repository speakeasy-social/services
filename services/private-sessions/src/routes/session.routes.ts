import { SessionService } from '../services/session.service.js';
import {
  authorize,
  RequestHandler,
  RequestHandlerReturn,
  ExtendedRequest,
  validateAgainstLexicon,
} from '@speakeasy-services/common';
import {
  revokeSessionDef,
  addUserDef,
  createSessionDef,
} from '../lexicon/types/session.js';
import { toSessionKeyView } from '../views/private-sessions.views.js';

const sessionService = new SessionService();

// Define method handlers with lexicon validation
const methodHandlers = {
  /**
   * Creates a new private session with the specified session keys
   * @param req - The request containing session keys and user information
   * @returns Promise containing the created session ID
   */
  'social.spkeasy.privateSession.create': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(createSessionDef, req.body);

    const { sessionKeys, expirationHours } = req.body;

    authorize(req, 'create', 'private_session', { authorDid: req.user?.did });

    const result = await sessionService.createSession({
      authorDid: req.user!.did!,
      recipients: sessionKeys,
      expirationHours,
    });
    return {
      body: { sessionId: result.sessionId },
    };
  },

  /**
   * Revokes an existing private session
   * @param req - The request containing the author DID to revoke
   * @returns Promise indicating success of the revocation
   */
  'social.spkeasy.privateSession.revoke': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(revokeSessionDef, req.body);

    const { authorDid } = req.body;

    authorize(req, 'revoke', 'private_session', { ...req.user!, authorDid });

    await sessionService.revokeSession(authorDid);
    return {
      body: { success: true },
    };
  },

  /**
   * Retrieves the current private session key for the authenticated user
   * @param req - The request containing the authenticated user's DID
   * @returns Promise containing the current private session
   */
  'social.spkeasy.privateSession.getSession': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const sessionKey = await sessionService.getSession(req.user?.did || '');

    authorize(req, 'revoke', 'private_session', sessionKey);

    return {
      body: { encryptedSessionKey: toSessionKeyView(sessionKey) },
    };
  },

  /**
   * Adds a new recipient to an existing private session
   * @param req - The request containing author and recipient DIDs
   * @returns Promise indicating success of adding the recipient
   */
  'social.spkeasy.privateSession.addUser': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(addUserDef, req.body);

    const authorDid = req.user?.did!;

    authorize(req, 'add_recipient', 'private_session', {
      authorDid,
    });

    await sessionService.addRecipientToSession(authorDid, req.body);
    return {
      body: { success: true },
    };
  },
} as const;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, { handler: RequestHandler }> = {
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
  'social.spkeasy.privateSession.getSession': {
    handler: methodHandlers['social.spkeasy.privateSession.getSession'],
  },
};

type MethodName = keyof typeof methodHandlers;
