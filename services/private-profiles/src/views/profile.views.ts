import { safeBtoa } from '@speakeasy-services/common';
import type { SafeText } from '@speakeasy-services/common';
import {
  PrivateProfile,
  Session,
  SessionKey,
} from '../generated/prisma-client/index.js';

export type ProfileView = {
  did: string;
  encryptedContent: SafeText;
  encryptedDek: SafeText;
  userKeyPairId: string;
  avatarUri: string | null;
  bannerUri: string | null;
};

type ProfileWithSessionKey = PrivateProfile & {
  session: Session & {
    sessionKeys: SessionKey[];
  };
};

export function toProfileView(profile: ProfileWithSessionKey): ProfileView {
  const sessionKey = profile.session.sessionKeys[0];

  return {
    did: profile.authorDid,
    encryptedContent: safeBtoa(profile.encryptedContent),
    encryptedDek: safeBtoa(sessionKey.encryptedDek),
    userKeyPairId: sessionKey.userKeyPairId,
    avatarUri: profile.avatarUri,
    bannerUri: profile.bannerUri,
  };
}

export function toProfileListView(
  profiles: ProfileWithSessionKey[],
): ProfileView[] {
  return profiles.map(toProfileView);
}
