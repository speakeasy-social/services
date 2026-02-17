/**
 * XRPC method definitions for trust management
 */

import { TrustService } from '../services/trust.service.js';
import {
  ValidationError,
  authorize,
  RequestHandler,
  RequestHandlerReturn,
  ExtendedRequest,
  validateAgainstLexicon,
  User,
  getSessionDid,
} from '@speakeasy-services/common';
import {
  getTrustedDef,
  addTrustedDef,
  removeTrustedDef,
  bulkAddTrustedDef,
  bulkRemoveTrustedDef,
} from '../lexicon/types/trust.js';
import { toTrustedUsersListView } from '../views/trusted-user.view.js';

const trustService = new TrustService();

// Define method handlers
const methodHandlers = {
  /**
   * Lists all trusted users for a given DID
   */
  'social.spkeasy.graph.getTrusted': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(getTrustedDef, req.query);

    const { authorDid, recipientDid } = req.query;

    // Check if the user can list trusted users for this authorDid
    authorize(req, 'list', 'trusted_user', { authorDid });

    // Get the data from the service
    const trustedUsers = await trustService.getTrusted(
      authorDid as string,
      recipientDid as string | undefined,
    );
    authorize(req, 'list', 'trusted_user', trustedUsers);

    // Transform to view
    return {
      body: { trusted: toTrustedUsersListView(trustedUsers) },
    };
  },

  /**
   * Gets the count of trusted users for the current user
   */
  'social.spkeasy.graph.getTrustedCount': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const authorDid = getSessionDid(req);

    authorize(req, 'count', 'trusted_user', { authorDid });

    // Get the data from the service
    const trustedCount = await trustService.getTrustedCount(
      authorDid as string,
    );

    // Transform to view
    return {
      body: { trustedCount },
    };
  },

  /**
   * Gets the daily trusted user quota and remaining count for the current user
   */
  'social.spkeasy.graph.getDailyTrustedQuota': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const authorDid = getSessionDid(req);

    authorize(req, 'count', 'trusted_user', { authorDid });

    // Get the data from the service
    const { maxDaily, remaining } = await trustService.getTrustedQuota(
      authorDid as string,
    );

    // Transform to view
    return {
      body: { maxDaily, remaining },
    };
  },

  /**
   * Adds a new user to the trusted list
   */
  'social.spkeasy.graph.addTrusted': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const { recipientDid } = req.body as { recipientDid: string };
    // Validate input against lexicon
    validateAgainstLexicon(addTrustedDef, req.body);

    const authorDid = getSessionDid(req);

    // Authorize the action
    authorize(req, 'create', 'trusted_user', { authorDid });

    // Perform the action
    await trustService.addTrusted(authorDid!, recipientDid);

    return {
      body: { success: true },
    };
  },

  /**
   * Adds a new user to the trusted list
   */
  'social.spkeasy.graph.bulkAddTrusted': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const { recipientDids } = req.body as { recipientDids: string[] };
    // Validate input against lexicon
    validateAgainstLexicon(bulkAddTrustedDef, req.body);

    const authorDid = getSessionDid(req);

    // Authorize the action
    authorize(req, 'create', 'trusted_user', { authorDid });

    // Perform the action
    const updatedRecipientDids = await trustService.bulkAddTrusted(
      authorDid!,
      recipientDids,
    );

    return {
      body: { recipientDids: updatedRecipientDids },
    };
  },

  /**
   * Removes a user from the trusted list
   */
  'social.spkeasy.graph.removeTrusted': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(removeTrustedDef, req.body);

    const { recipientDid } = req.body as { recipientDid: string };
    // getSessionDid will throw NoSessionError if user DID is missing

    const authorDid = getSessionDid(req);

    // Authorize the action
    authorize(req, 'delete', 'trusted_user', { authorDid });

    // Perform the action
    await trustService.removeTrusted(authorDid, recipientDid);

    return {
      body: { success: true },
    };
  },

  /**
   * Adds a new user to the trusted list
   */
  'social.spkeasy.graph.bulkRemoveTrusted': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const { recipientDids } = req.body as { recipientDids: string[] };
    // Validate input against lexicon
    validateAgainstLexicon(bulkRemoveTrustedDef, req.body);

    const authorDid = getSessionDid(req);

    // Authorize the action
    authorize(req, 'delete', 'trusted_user', { authorDid });

    // Perform the action
    const removedRecipientDids = await trustService.bulkRemoveTrusted(
      authorDid!,
      recipientDids,
    );

    return {
      body: { recipientDids: removedRecipientDids },
    };
  },
} as const;

type MethodName = keyof typeof methodHandlers;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, { handler: RequestHandler }> = {
  'social.spkeasy.graph.getTrusted': {
    handler: methodHandlers['social.spkeasy.graph.getTrusted'],
  },
  'social.spkeasy.graph.getTrustedCount': {
    handler: methodHandlers['social.spkeasy.graph.getTrustedCount'],
  },
  'social.spkeasy.graph.getDailyTrustedQuota': {
    handler: methodHandlers['social.spkeasy.graph.getDailyTrustedQuota'],
  },
  'social.spkeasy.graph.addTrusted': {
    handler: methodHandlers['social.spkeasy.graph.addTrusted'],
  },
  'social.spkeasy.graph.bulkAddTrusted': {
    handler: methodHandlers['social.spkeasy.graph.bulkAddTrusted'],
  },
  'social.spkeasy.graph.removeTrusted': {
    handler: methodHandlers['social.spkeasy.graph.removeTrusted'],
  },
  'social.spkeasy.graph.bulkRemoveTrusted': {
    handler: methodHandlers['social.spkeasy.graph.bulkRemoveTrusted'],
  },
};
