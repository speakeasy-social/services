/**
 * XRPC method definitions for trust management
 */

import { TrustService } from '../services/trust.service.js';
import { MethodSchema } from '@atproto/xrpc-server';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ServiceError, ValidationError } from '@speakeasy-services/common/errors.js';

const trustService = new TrustService();

// Define methods using XRPC lexicon
export const methods: Record<string, MethodSchema> = {
  'social.speakeasy.users.get_trusted_by': {
    description: 'List users who trust a given DID',
    parameters: {
      did: { type: 'string', required: true },
    },
    handler: async (params) => {
      return await trustService.getTrustedBy(params.did);
    },
  },
  'social.speakeasy.users.add_trusted': {
    description: 'Add a new trusted user',
    parameters: {
      did: { type: 'string', required: true },
    },
    handler: async (params) => {
      return await trustService.addTrusted(params.did);
    },
  },
  'social.speakeasy.users.remove_trusted': {
    description: 'Remove a trusted user',
    parameters: {
      did: { type: 'string', required: true },
    },
    handler: async (params) => {
      return await trustService.removeTrusted(params.did);
    },
  },
};
