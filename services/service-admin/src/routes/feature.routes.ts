import {
  authorize,
  ExtendedRequest,
  getSessionDid,
  RequestHandler,
  RequestHandlerReturn,
  validateAgainstLexicon
} from '@speakeasy-services/common';
import {
  applyInviteCodeDef,
  donateDef,
  getFeaturesDef
} from '../lexicon/types/features.js';
import { FeatureService } from '../services/feature.service.js';
import { Mode } from '../types.js';
import { toFeaturesListView } from '../views/feature.views.js';

const featureService = new FeatureService();

// Define method handlers with lexicon validation
const methodHandlers = {
  'social.spkeasy.actor.getFeatures': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const { did } = req.query;

    // Validate input against lexicon
    validateAgainstLexicon(getFeaturesDef, req.query);

    authorize(req, 'list', 'feature', { userDid: did });

    const features = await featureService.getFeatures(did as string);

    return {
      body: { features: toFeaturesListView(features) },
    };
  },
  'social.spkeasy.actor.applyInviteCode': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const did = getSessionDid(req);
    const { code } = req.body;

    // Validate input against lexicon
    validateAgainstLexicon(applyInviteCodeDef, req.body);

    authorize(req, 'apply', 'invite_code', { userDid: did });

    await featureService.applyInviteCode(did, code);

    return {
      body: { status: 'success' },
    };
  },
  'social.spkeasy.actor.donate': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const { unit_amount: unitAmount, mode } = req.body;

    // Validate input against lexicon
    validateAgainstLexicon(donateDef, req.body);

    const clientSecret = await featureService.donate(unitAmount as number, mode as Mode);

    return {
      body: {
        status: 'success',
        clientSecret,
      },
    };
  },
} as const;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, { handler: RequestHandler }> = {
  'social.spkeasy.actor.getFeatures': {
    handler: methodHandlers['social.spkeasy.actor.getFeatures'],
  },
  'social.spkeasy.actor.applyInviteCode': {
    handler: methodHandlers['social.spkeasy.actor.applyInviteCode'],
  },
  'social.spkeasy.actor.donate': {
    handler: methodHandlers['social.spkeasy.actor.donate'],
  },
};

type MethodName = keyof typeof methodHandlers;
