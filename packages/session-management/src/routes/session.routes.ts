import { SessionService } from '../session.service.js';
import {
  authorize,
  RequestHandler,
  RequestHandlerReturn,
  ExtendedRequest,
  validateAgainstLexicon,
  User,
  safeBtoa,
} from '@speakeasy-services/common';
import { toSessionKeyView } from '../views/session.views.js';

export interface SessionRouteConfig {
  serviceName: string;
  lexiconPrefix: string;
  sessionService: SessionService;
}

export function createSessionRoutes(config: SessionRouteConfig) {
  const { serviceName, lexiconPrefix, sessionService } = config;

  // Define method handlers with lexicon validation
  const methodHandlers = {
    [`${lexiconPrefix}.create`]: async (
      req: ExtendedRequest,
    ): RequestHandlerReturn => {
      // Validate input against lexicon
      validateAgainstLexicon(`${lexiconPrefix}.create`, req.body);

      const { sessionKeys, expirationHours } = req.body;

      authorize(req, 'create', `${serviceName}_session`, {
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
      validateAgainstLexicon(`${lexiconPrefix}.revoke`, req.body);

      const { authorDid } = req.body;

      authorize(req, 'revoke', `${serviceName}_session`, {
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

      authorize(req, 'revoke', `${serviceName}_session`, sessionKey);

      // Convert the session key to the expected format
      const sessionKeyView = {
        recipientDid: sessionKey.recipientDid,
        userKeyPairId: sessionKey.userKeyPairId,
        encryptedDek: safeBtoa(sessionKey.encryptedDek),
        createdAt: sessionKey.createdAt,
      };

      return {
        body: { encryptedSessionKey: toSessionKeyView(sessionKey) },
      };
    },

    [`${lexiconPrefix}.addUser`]: async (
      req: ExtendedRequest,
    ): RequestHandlerReturn => {
      // Validate input against lexicon
      validateAgainstLexicon(`${lexiconPrefix}.addUser`, req.body);

      const authorDid = (req.user as User)!.did!;

      authorize(req, 'add_recipient', `${serviceName}_session`, {
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
      validateAgainstLexicon(`${lexiconPrefix}.updateKeys`, req.body);

      authorize(req, 'update', `${serviceName}_session`);

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
