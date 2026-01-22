import { ProfileService } from '../services/profile.service.js';
import {
  validateAgainstLexicon,
  ExtendedRequest,
  RequestHandlerReturn,
  User,
  ValidationError,
} from '@speakeasy-services/common';
import {
  getProfileDef,
  getProfilesDef,
  putProfileDef,
} from '../lexicon/types/profile.js';
import {
  toProfileView,
  toProfileListView,
} from '../views/profile.views.js';
import {
  toSessionKeyView,
  toSessionKeyListView,
} from '@speakeasy-services/session-management';

const profileService = new ProfileService();

const methodHandlers = {
  'social.spkeasy.actor.getProfile': async (
    req: ExtendedRequest,
  ): Promise<RequestHandlerReturn> => {
    validateAgainstLexicon(getProfileDef, req.query);

    const targetDid = req.query.did as string;
    if (!targetDid) {
      throw new ValidationError('did parameter is required');
    }

    const callerDid = (req.user as User)!.did!;
    const { profile, sessionKey } = await profileService.getProfile(
      callerDid,
      targetDid,
    );

    return {
      body: {
        profile: toProfileView(profile),
        encryptedSessionKey: toSessionKeyView(sessionKey),
      },
    };
  },

  'social.spkeasy.actor.getProfiles': async (
    req: ExtendedRequest,
  ): Promise<RequestHandlerReturn> => {
    validateAgainstLexicon(getProfilesDef, req.query);

    const dids = req.query.dids;
    if (!dids) {
      throw new ValidationError('dids parameter is required');
    }

    // Handle both single value and array
    const targetDids = Array.isArray(dids) ? dids : [dids];

    const callerDid = (req.user as User)!.did!;
    const { profiles, sessionKeys } = await profileService.getProfiles(
      callerDid,
      targetDids as string[],
    );

    return {
      body: {
        profiles: toProfileListView(profiles),
        encryptedSessionKeys: toSessionKeyListView(sessionKeys),
      },
    };
  },

  'social.spkeasy.actor.putProfile': async (
    req: ExtendedRequest,
  ): Promise<RequestHandlerReturn> => {
    validateAgainstLexicon(putProfileDef, req.body);
    const did = (req.user as User)!.did!;
    const profile = await profileService.updateProfile(did, req.body);
    return { body: { profile: toProfileView(profile) } };
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
  'social.spkeasy.actor.getProfiles': {
    handler: methodHandlers['social.spkeasy.actor.getProfiles'],
  },
  'social.spkeasy.actor.putProfile': {
    handler: methodHandlers['social.spkeasy.actor.putProfile'],
  },
  'social.spkeasy.actor.deleteProfile': {
    handler: methodHandlers['social.spkeasy.actor.deleteProfile'],
  },
};
