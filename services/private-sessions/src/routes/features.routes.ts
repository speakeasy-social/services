import { FeatureService } from '../services/feature.service.js';
import { ValidationError } from '@speakeasy-services/common';
import { HandlerOutput } from '@atproto/xrpc-server';
import {
  authorize,
  RequestHandler,
  ExtendedRequest,
} from '@speakeasy-services/common';
import { toFeaturesListView } from '../views/feature.views.js';
import { getFeaturesDef } from '../lexicon/types/features.js';

const featureService = new FeatureService();

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
  'social.spkeasy.actor.getFeatures': async (
    req: ExtendedRequest,
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    validateAgainstLexicon(getFeaturesDef, req.query);

    const { did } = req.query;

    const features = await featureService.getFeatures(did);

    authorize(req, 'list', 'feature', features);

    return {
      encoding: 'application/json',
      body: { features: toFeaturesListView(features) },
    };
  },
} as const;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, { handler: RequestHandler }> = {
  // Session management methods
  'social.spkeasy.actor.getFeatures': {
    handler: methodHandlers['social.spkeasy.actor.getFeatures'],
  },
};

type MethodName = keyof typeof methodHandlers;
