import { FeatureService } from '../services/feature.service.js';
import {
  authorize,
  RequestHandler,
  RequestHandlerReturn,
  ExtendedRequest,
  validateAgainstLexicon,
} from '@speakeasy-services/common';
import { toFeaturesListView } from '../views/feature.views.js';
import { getFeaturesDef } from '../lexicon/types/features.js';

const featureService = new FeatureService();

// Define method handlers with lexicon validation
const methodHandlers = {
  'social.spkeasy.actor.getFeatures': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(getFeaturesDef, req.query);

    const { did } = req.query;

    const features = await featureService.getFeatures(did as string);

    authorize(req, 'list', 'feature', features);

    return {
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
