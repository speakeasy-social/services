import { ProfileService } from '../services/profile.service.js';
import {
  authorize,
  validateAgainstLexicon,
  ExtendedRequest,
  RequestHandlerReturn,
  getSessionDid,
} from '@speakeasy-services/common';
import {
  getProfileDef,
  getProfilesDef,
  putProfileDef,
} from '../lexicon/types/profile.js';
import { toProfileView, toProfileListView } from '../views/profile.views.js';

const profileService = new ProfileService();

const methodHandlers = {
  'social.spkeasy.actor.getProfile': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    validateAgainstLexicon(getProfileDef, req.query);
    const viewerDid = getSessionDid(req);
    const targetDid = req.query.did as string;
    const profile = await profileService.getProfile(viewerDid, targetDid);

    authorize(req, 'list', 'private_profile', profile as unknown as Record<string, unknown>);

    return { body: { profile: toProfileView(profile) } };
  },
  'social.spkeasy.actor.getProfiles': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    validateAgainstLexicon(getProfilesDef, req.query);
    const viewerDid = getSessionDid(req);
    const rawDids = req.query.dids;
    const targetDids = Array.isArray(rawDids) ? rawDids as string[] : [rawDids as string];
    const profiles = await profileService.getProfiles(viewerDid, targetDids);

    authorize(req, 'list', 'private_profile', profiles as unknown as Record<string, unknown>[]);

    return { body: { profiles: toProfileListView(profiles) } };
  },
  'social.spkeasy.actor.putProfile': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    validateAgainstLexicon(putProfileDef, req.body);
    const did = getSessionDid(req);

    authorize(req, 'update', 'private_profile', { authorDid: did });

    await profileService.updateProfile(did, req.body);
    return { body: { success: true } };
  },
  'social.spkeasy.actor.deleteProfile': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const did = getSessionDid(req);

    authorize(req, 'delete', 'private_profile', { authorDid: did });

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
