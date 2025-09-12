import { FeatureService } from '../services/feature.service.js';
import {
  authorize,
  RequestHandler,
  RequestHandlerReturn,
  ExtendedRequest,
  validateAgainstLexicon,
  User,
  getSessionDid,
} from '@speakeasy-services/common';
import {
  getFeaturesDef,
  applyInviteCodeDef,
  createCheckoutSessionDef,
  createSubscriptionDef,
} from '../lexicon/types/features.js';
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
  'social.spkeasy.actor.createCheckoutSession': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const { unit_amount: unitAmount } = req.body;

    // Validate input against lexicon
    validateAgainstLexicon(createCheckoutSessionDef, req.body);

    const clientSecret = await featureService.createCheckoutSession(unitAmount as number);

    return {
      body: {
        status: 'success',
        clientSecret,
      },
    };
  },
  'social.spkeasy.actor.createSubscription': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const { unit_amount: unitAmount } = req.body;

    // Validate input against lexicon
    validateAgainstLexicon(createSubscriptionDef, req.body);

    // const clientSecret = await featureService.createSubscription();
    const clientSecret = await featureService.createSubscription(unitAmount as number);

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
  'social.spkeasy.actor.createCheckoutSession': {
    handler: methodHandlers['social.spkeasy.actor.createCheckoutSession'],
  },
  'social.spkeasy.actor.createSubscription': {
    handler: methodHandlers['social.spkeasy.actor.createSubscription'],
  },
};

type MethodName = keyof typeof methodHandlers;
