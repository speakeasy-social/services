import {
  authorize,
  ExtendedRequest,
  getSessionDid,
  RequestHandler,
  RequestHandlerReturn,
  validateAgainstLexicon,
  ValidationError
} from '@speakeasy-services/common';
import {
  applyInviteCodeDef,
  donateDef,
  generateInviteCodeDef,
  getFeaturesDef,
  listInviteCodesDef
} from '../lexicon/types/features.js';
import { FeatureService } from '../services/feature.service.js';
import { Mode } from '../types.js';
import { toFeaturesListView } from '../views/feature.views.js';
import { z } from 'zod';

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
  'social.spkeasy.actor.generateInviteCode': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const did = getSessionDid(req);

    // Validate input against lexicon
    validateAgainstLexicon(generateInviteCodeDef, req.body);

    authorize(req, 'create', 'invite_code', { creatorDid: did });

    const result = await featureService.generateInviteCode(did);

    return {
      body: result,
    };
  },
  'social.spkeasy.actor.listInviteCodes': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const did = getSessionDid(req);

    // Validate input against lexicon
    validateAgainstLexicon(listInviteCodesDef, req.query);

    authorize(req, 'list', 'invite_code', { creatorDid: did });

    const inviteCodes = await featureService.listInviteCodes(did);

    return {
      body: { inviteCodes },
    };
  },
  'social.spkeasy.actor.donate': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(donateDef, req.body);

    const { unitAmount, mode, currency, donorEmail } = req.body;

    // Validate currency is a 3-letter code
    const currencySchema = z.string().length(3).toUpperCase();
    const currencyResult = currencySchema.safeParse(currency);
    if (!currencyResult.success) {
      throw new ValidationError('Currency must be a 3-letter ISO code (e.g., USD, NZD, EUR)');
    }

    // Validate donorEmail if provided
    if (donorEmail !== undefined) {
      const emailSchema = z.string().email();
      const emailResult = emailSchema.safeParse(donorEmail);
      if (!emailResult.success) {
        throw new ValidationError('Invalid email address format');
      }
    }

    // Get donor DID if user is authenticated
    const donorDid = req.user?.type === 'user' ? req.user.did : undefined;

    const clientSecret = await featureService.donate(
      unitAmount as number,
      mode as Mode,
      currencyResult.data,
      donorEmail as string | undefined,
      donorDid
    );

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
  'social.spkeasy.actor.generateInviteCode': {
    handler: methodHandlers['social.spkeasy.actor.generateInviteCode'],
  },
  'social.spkeasy.actor.listInviteCodes': {
    handler: methodHandlers['social.spkeasy.actor.listInviteCodes'],
  },
  'social.spkeasy.actor.donate': {
    handler: methodHandlers['social.spkeasy.actor.donate'],
  },
};

type MethodName = keyof typeof methodHandlers;
