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
  getExcludedProfileDidsDef,
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
    return { body: { profile: toProfileView(profile) } };
  },
  'social.spkeasy.actor.getProfiles': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    validateAgainstLexicon(getProfilesDef, req.query);
    const viewerDid = getSessionDid(req);
    const rawDids = req.query.dids;
    const targetDids = Array.isArray(rawDids)
      ? (rawDids as string[])
      : [rawDids as string];
    const profiles = await profileService.getProfiles(viewerDid, targetDids);
    return { body: { profiles: toProfileListView(profiles) } };
  },
  'social.spkeasy.actor.putProfile': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    validateAgainstLexicon(putProfileDef, req.body);
    const did = getSessionDid(req);
    await profileService.updateProfile(did, req.body);
    return { body: { success: true } };
  },
  'social.spkeasy.actor.getExcludedProfileDids': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    validateAgainstLexicon(getExcludedProfileDidsDef, req.query);
    authorize(req, 'list', 'private_profile', {});

    const rawDids = req.query.dids;
    const dids = Array.isArray(rawDids)
      ? (rawDids as string[])
      : [rawDids as string];
    const viewerDid = req.query.viewerDid as string | undefined;

    const excludedDids = await profileService.getExcludedProfileDids(
      dids,
      viewerDid,
    );
    return { body: { excludedDids } };
  },
  'social.spkeasy.actor.deleteProfile': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const did = getSessionDid(req);
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
  'social.spkeasy.actor.getExcludedProfileDids': {
    handler: methodHandlers['social.spkeasy.actor.getExcludedProfileDids'],
  },
  'social.spkeasy.actor.deleteProfile': {
    handler: methodHandlers['social.spkeasy.actor.deleteProfile'],
  },
};
