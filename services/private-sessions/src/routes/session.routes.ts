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
import {
  revokeSessionDef,
  addUserDef,
  createSessionDef,
} from '../lexicon/types/session.js';
import { toSessionKeyView } from '../views/private-sessions.views.js';

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
  /**
   * Creates a new private session with the specified session keys
   * @param req - The request containing session keys and user information
   * @returns Promise containing the created session ID
   */
  'social.spkeasy.privateSession.create': async (
    req: ExtendedRequest,
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    validateAgainstLexicon(createSessionDef, req.body);

    const { sessionKeys, expirationHours } = req.body;

    authorize(req, 'create', 'private_session', { authorDid: req.user.did });

    const result = await sessionService.createSession({
      authorDid: req.user.did!,
      recipients: sessionKeys,
      expirationHours,
    });
    return {
      encoding: 'application/json',
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
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    validateAgainstLexicon(revokeSessionDef, req.body);

    const { authorDid } = req.body;

    authorize(req, 'revoke', 'private_session', { ...req.user!, authorDid });

    await sessionService.revokeSession(authorDid);
    return {
      encoding: 'application/json',
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
  ): Promise<HandlerOutput> => {
    const sessionKey = await sessionService.getSession(req.user.did!);

    authorize(req, 'revoke', 'private_session', sessionKey);

    return {
      encoding: 'application/json',
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
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    validateAgainstLexicon(addUserDef, req.body);

    const { authorDid, recipientDid } = req.body;

    authorize(req, 'add_recipient', 'private_session', {
      authorDid,
    });

    await sessionService.addRecipientToSession(authorDid, recipientDid);
    return {
      encoding: 'application/json',
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
