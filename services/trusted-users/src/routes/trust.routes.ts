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
  'social.spkeasy.graph.getTrusts': {
    description: 'List users who trust a given DID',
    parameters: {
      did: { type: 'string', required: true },
    },
    handler: async (params) => {
      return await trustService.getTrustedBy(params.did);
    },
  },
  'social.spkeasy.graph.addTrusted': {
    description: 'Add a new trusted user',
    parameters: {
      did: { type: 'string', required: true },
    },
    handler: async (params) => {
      return await trustService.addTrusted(params.did);
    },
  },
  'social.spkeasy.graph.removeTrusted': {
    description: 'Remove a trusted user',
    parameters: {
      did: { type: 'string', required: true },
    },
    handler: async (params) => {
      return await trustService.removeTrusted(params.did);
    },
  },
};
