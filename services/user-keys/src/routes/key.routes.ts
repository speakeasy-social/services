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
} from '@speakeasy-services/common';
import {
  getPublicKeyDef,
  getPrivateKeyDef,
  rotateKeyDef,
  getPublicKeysDef,
} from '../lexicon/types/key.js';

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
      body: {
        publicKey: key.publicKey,
        recipientDid: key.authorDid,
        userKeyPairId: key.id,
      },
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
        publicKeys: keys.map((key) => ({
          publicKey: key.publicKey,
          recipientDid: key.authorDid,
          userKeyPairId: key.id,
        })),
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
    const key = await keyService.getPrivateKey(req.user?.did!);
    if (!key) {
      throw new NotFoundError('Private key not found');
    }

    authorize(req, 'get_private_key', 'key', key);

    return {
      body: {
        id: key.id,
        // FIXME use view pattern
        privateKey: key.privateKey,
        authorDid: key.authorDid,
        userKeyPairId: key.id,
      },
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

    authorize(req, 'update', 'key', { authorDid: req.user?.did });

    const result = await keyService.requestRotation(
      req.user?.did!,
      privateKey,
      publicKey,
    );
    return {
      body: {
        userKeyPairId: result!.id,
        publicKey: result!.publicKey,
      },
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
  'social.spkeasy.key.rotate': {
    handler: methodHandlers['social.spkeasy.key.rotate'],
  },
};
