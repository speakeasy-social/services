/**
 * XRPC method definitions for trust management
 */

import { TrustService } from '../services/trust.service.js';
import { HandlerOutput } from '@atproto/xrpc-server';
import {
  ValidationError,
  authorize,
  RequestHandler,
  ExtendedRequest,
  Subject,
} from '@speakeasy-services/common';
import {
  getTrustedDef,
  addTrustedDef,
  removeTrustedDef,
} from '../lexicon/types/trust.js';
import { toTrustedUsersListView } from '../views/trusted-user.view.js';

const trustService = new TrustService();

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

// Define method handlers
const methodHandlers = {
  /**
   * Lists all trusted users for a given DID
   */
  'social.spkeasy.graph.getTrusted': async (
    req: ExtendedRequest,
  ): Promise<HandlerOutput> => {
    const did = req.query.did || req.user.did;
    // Validate input against lexicon
    validateAgainstLexicon(getTrustedDef, { did });

    // Get the data from the service
    const trustedUsers = await trustService.getTrusted(did);
    authorize(req, 'list', 'trusted_user', { authorDid: did });

    // Transform to view
    return {
      encoding: 'application/json',
      body: { trusted: toTrustedUsersListView(trustedUsers) },
    };
  },

  /**
   * Adds a new user to the trusted list
   */
  'social.spkeasy.graph.addTrusted': async (
    req: ExtendedRequest,
  ): Promise<HandlerOutput> => {
    const { recipientDid } = req.body as { recipientDid: string };
    // Validate input against lexicon
    validateAgainstLexicon(addTrustedDef, req.body);

    const authorDid = req.user.did;

    // Authorize the action
    authorize(req, 'create', 'trusted_user', { authorDid });

    // Perform the action
    await trustService.addTrusted(authorDid!, recipientDid);

    return {
      encoding: 'application/json',
      body: { success: true },
    };
  },

  /**
   * Removes a user from the trusted list
   */
  'social.spkeasy.graph.removeTrusted': async (
    req: ExtendedRequest,
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    validateAgainstLexicon(removeTrustedDef, req.body);

    const { recipientDid } = req.body as { recipientDid: string };
    if (!req.user?.did) {
      throw new ValidationError('User DID is required');
    }

    const authorDid = req.user.did;

    // Authorize the action
    authorize(req, 'delete', 'trusted_user', { authorDid });

    // Perform the action
    await trustService.removeTrusted(authorDid, recipientDid);

    return {
      encoding: 'application/json',
      body: { success: true },
    };
  },
} as const;

type MethodName = keyof typeof methodHandlers;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, { handler: RequestHandler }> = {
  'social.spkeasy.graph.getTrusted': {
    handler: methodHandlers['social.spkeasy.graph.getTrusted'],
  },
  'social.spkeasy.graph.addTrusted': {
    handler: methodHandlers['social.spkeasy.graph.addTrusted'],
  },
  'social.spkeasy.graph.removeTrusted': {
    handler: methodHandlers['social.spkeasy.graph.removeTrusted'],
  },
};
