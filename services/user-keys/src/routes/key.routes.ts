/**
 * XRPC endpoints for key management
 */

import { KeyService } from '../services/key.service.js';
import {
  authorize,
  RequestHandler,
  RequestHandlerReturn,
  ExtendedRequest,
  NotFoundError,
  validateAgainstLexicon,
  AuthorizationError,
  User,
} from '@speakeasy-services/common';
import {
  getPublicKeyDef,
  getPrivateKeysDef,
  getPrivateKeyDef,
  rotateKeyDef,
  getPublicKeysDef,
} from '../lexicon/types/key.js';
import {
  toPublicKeyView,
  toPublicKeyListView,
  toPrivateKeyListView,
  toPrivateKeyView,
} from '../views/key.views.js';

const keyService = new KeyService();

// Define method handlers
const methodHandlers = {
  /**
   * Get a user's public key by their DID
   */
  'social.spkeasy.key.getPublicKey': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(getPublicKeyDef, req.query);

    const { did } = req.query as { did: string };

    // Public key is publicly accessible
    const key = await keyService.getOrCreatePublicKey(did);

    return {
      body: toPublicKeyView(key),
    };
  },

  /**
   * Get a user's public key by their DID
   */
  'social.spkeasy.key.getPublicKeys': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(getPublicKeysDef, req.query);

    const dids = (req.query.dids as string).split(',');

    // Public key is publicly accessible
    const keys = await keyService.getPublicKeys(dids);

    return {
      body: {
        publicKeys: toPublicKeyListView(keys),
      },
    };
  },

  /**
   * Get the authenticated user's private key
   */
  'social.spkeasy.key.getPrivateKey': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(getPrivateKeyDef, {});

    // Only the owner can access their private key
    const key = await keyService.getPrivateKey((req.user as User)?.did!);
    if (!key) {
      throw new NotFoundError('Private key not found');
    }

    authorize(req, 'get_private', 'key', key);

    return {
      body: toPrivateKeyView(key),
    };
  },

  /**
   * Get the authenticated user's private keys
   */
  'social.spkeasy.key.getPrivateKeys': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    const validatedQuery = validateAgainstLexicon(getPrivateKeysDef, req.query);

    const { did, ids } = validatedQuery;

    // Only the owner can access their private key
    const keys = await keyService.getPrivateKeys(did, ids);

    authorize(req, 'list_private', 'key', keys);

    // Defence in depth
    // Guards against mistakes that allow retrieval of multiple users private keys
    // by throwing if there is more than one did in the result set
    const keyDids = [...new Set(keys.map((key) => key.authorDid))];
    if (keyDids.length > 1 || (keyDids[0] && keyDids[0] !== did)) {
      throw new AuthorizationError('Internal Authorization Error Occurred', {
        message: 'Attempt to send private keys of multiple users',
      });
    }

    return {
      body: { keys: toPrivateKeyListView(keys) },
    };
  },

  /**
   * Rotate a user's key pair with new public/private keys
   */
  'social.spkeasy.key.rotate': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(rotateKeyDef, req.body);

    const { privateKey, publicKey } = req.body;

    authorize(req, 'update', 'key', { authorDid: (req.user as User)?.did });

    const result = await keyService.requestRotation(
      (req.user as User)?.did!,
      privateKey,
      publicKey,
    );
    return {
      body: toPublicKeyView(result!),
    };
  },
} as const;

type MethodName = keyof typeof methodHandlers;

export const methods: Record<MethodName, { handler: RequestHandler }> = {
  'social.spkeasy.key.getPublicKey': {
    handler: methodHandlers['social.spkeasy.key.getPublicKey'],
  },
  'social.spkeasy.key.getPublicKeys': {
    handler: methodHandlers['social.spkeasy.key.getPublicKeys'],
  },
  'social.spkeasy.key.getPrivateKey': {
    handler: methodHandlers['social.spkeasy.key.getPrivateKey'],
  },
  'social.spkeasy.key.getPrivateKeys': {
    handler: methodHandlers['social.spkeasy.key.getPrivateKeys'],
  },
  'social.spkeasy.key.rotate': {
    handler: methodHandlers['social.spkeasy.key.rotate'],
  },
};
