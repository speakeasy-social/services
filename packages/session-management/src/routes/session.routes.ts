import { SessionService } from '../session.service.js';
import {
  authorize,
  RequestHandler,
  RequestHandlerReturn,
  ExtendedRequest,
  validateAgainstLexicon,
  User,
  Subject,
} from '@speakeasy-services/common';
import { toSessionKeyView } from '../views/session.views.js';
import { getSessionOperation } from '../lexicon/session.js';

export interface SessionRouteConfig {
  serviceName: string;
  authorizationRecord: Subject;
  lexiconPrefix: string;
  sessionService: SessionService;
}

export function createSessionRoutes(config: SessionRouteConfig) {
  const { serviceName, authorizationRecord, lexiconPrefix, sessionService } =
    config;

  // Get lexicon definitions for each operation
  const createLexicon = getSessionOperation('create');
  const revokeLexicon = getSessionOperation('revoke');
  const getSessionLexicon = getSessionOperation('getSession');
  const addUserLexicon = getSessionOperation('addUser');
  const updateKeysLexicon = getSessionOperation('updateKeys');

  // Define method handlers with lexicon validation
  const methodHandlers = {
    [`${lexiconPrefix}.create`]: async (
      req: ExtendedRequest,
    ): RequestHandlerReturn => {
      // Validate input against lexicon
      validateAgainstLexicon(createLexicon, req.body);

      const { sessionKeys, expirationHours } = req.body;

      authorize(req, 'create', authorizationRecord, {
        authorDid: (req.user as User)!.did!,
      });

      const result = await sessionService.createSession({
        authorDid: (req.user as User)!.did!,
        recipients: sessionKeys,
        expirationHours,
      });
      return {
        body: { sessionId: result.sessionId },
      };
    },

    [`${lexiconPrefix}.revoke`]: async (
      req: ExtendedRequest,
    ): RequestHandlerReturn => {
      // Validate input against lexicon
      validateAgainstLexicon(revokeLexicon, req.body);

      const { authorDid } = req.body;

      authorize(req, 'revoke', authorizationRecord, {
        ...req.user!,
        authorDid,
      });

      await sessionService.revokeSession(authorDid);
      return {
        body: { success: true },
      };
    },

    [`${lexiconPrefix}.getSession`]: async (
      req: ExtendedRequest,
    ): RequestHandlerReturn => {
      const sessionKey = await sessionService.getSession(
        (req.user as User)!.did!,
      );

      authorize(req, 'get_private', authorizationRecord, sessionKey);

      return {
        body: { encryptedSessionKey: toSessionKeyView(sessionKey) },
      };
    },

    [`${lexiconPrefix}.addUser`]: async (
      req: ExtendedRequest,
    ): RequestHandlerReturn => {
      // Validate input against lexicon
      validateAgainstLexicon(addUserLexicon, req.body);

      const authorDid = (req.user as User)!.did!;

      authorize(req, 'add_recipient', authorizationRecord, {
        authorDid,
      });

      await sessionService.addRecipientToSession(authorDid, req.body);
      return {
        body: { success: true },
      };
    },

    [`${lexiconPrefix}.updateKeys`]: async (
      req: ExtendedRequest,
    ): RequestHandlerReturn => {
      // Validate input against lexicon
      validateAgainstLexicon(updateKeysLexicon, req.body);

      authorize(req, 'update', authorizationRecord);

      await sessionService.updateSessionKeys(req.body);
      return {
        body: { success: true },
      };
    },
  } as const;

  // Define methods using XRPC lexicon
  const methods: Record<string, { handler: RequestHandler }> = {
    [`${lexiconPrefix}.create`]: {
      handler: methodHandlers[`${lexiconPrefix}.create`],
    },
    [`${lexiconPrefix}.revoke`]: {
      handler: methodHandlers[`${lexiconPrefix}.revoke`],
    },
    [`${lexiconPrefix}.addUser`]: {
      handler: methodHandlers[`${lexiconPrefix}.addUser`],
    },
    [`${lexiconPrefix}.getSession`]: {
      handler: methodHandlers[`${lexiconPrefix}.getSession`],
    },
    [`${lexiconPrefix}.updateKeys`]: {
      handler: methodHandlers[`${lexiconPrefix}.updateKeys`],
    },
  };

  return methods;
}
