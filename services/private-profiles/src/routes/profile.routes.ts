import { ProfileService } from '../services/profile.service.js';
import {
  validateAgainstLexicon,
  ExtendedRequest,
  RequestHandlerReturn,
  User,
} from '@speakeasy-services/common';
import {
  getProfileDef,
  putProfileDef,
  deleteProfileDef,
} from '../lexicon/types/profile.js';

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
  'social.spkeasy.actor.deleteProfile': async (
    req: ExtendedRequest,
  ): Promise<RequestHandlerReturn> => {
    const did = (req.user as User)!.did!;
    const result = await profileService.deleteProfile(did);
    return { body: result };
  },
};

export const methods = {
  'social.spkeasy.actor.getProfile': {
    handler: methodHandlers['social.spkeasy.actor.getProfile'],
  },
  'social.spkeasy.actor.putProfile': {
    handler: methodHandlers['social.spkeasy.actor.putProfile'],
  },
  'social.spkeasy.actor.deleteProfile': {
    handler: methodHandlers['social.spkeasy.actor.deleteProfile'],
  },
};
