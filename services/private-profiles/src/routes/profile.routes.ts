import { ProfileService } from '../services/profile.service.js';
import {
  validateAgainstLexicon,
  ExtendedRequest,
  RequestHandlerReturn,
  User,
} from '@speakeasy-services/common';
import { getProfileDef, putProfileDef } from '../lexicon/types/profile.js';

const profileService = new ProfileService();

const methodHandlers = {
  'social.spkeasy.actor.getProfile': async (
    req: ExtendedRequest,
  ): Promise<RequestHandlerReturn> => {
    validateAgainstLexicon(getProfileDef, req.body);
    const did = (req.user as User)!.did!;
    const profile = await profileService.getProfile(did);
    return { body: { profile } };
  },
  'social.spkeasy.actor.putProfile': async (
    req: ExtendedRequest,
  ): Promise<RequestHandlerReturn> => {
    validateAgainstLexicon(putProfileDef, req.body);
    const did = (req.user as User)!.did!;
    const profile = await profileService.updateProfile(did, req.body);
    return { body: { profile } };
  },
};

export const methods = {
  'social.spkeasy.actor.getProfile': {
    handler: methodHandlers['social.spkeasy.actor.getProfile'],
  },
  'social.spkeasy.actor.putProfile': {
    handler: methodHandlers['social.spkeasy.actor.putProfile'],
  },
};
