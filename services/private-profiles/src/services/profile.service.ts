import {
  PrivateProfile,
  ProfileSessionKey,
} from '../generated/prisma-client/index.js';
import { NotFoundError } from '@speakeasy-services/common';
import { getPrismaClient } from '../db.js';

const prisma = getPrismaClient();

export class ProfileService {
  /**
   * Gets a single profile by target DID, verifying the caller has access via session key
   * @param callerDid - The DID of the requesting user
   * @param targetDid - The DID of the profile owner
   * @returns Profile and session key if caller has access
   * @throws NotFoundError if profile doesn't exist or caller lacks access
   */
  async getProfile(
    callerDid: string,
    targetDid: string,
  ): Promise<{ profile: PrivateProfile; sessionKey: ProfileSessionKey }> {
    const profile = await prisma.privateProfile.findFirst({
      where: {
        authorDid: targetDid,
      },
    });

    if (!profile) {
      throw new NotFoundError('Profile not found');
    }

    // Verify caller has access via session key
    const sessionKey = await prisma.profileSessionKey.findFirst({
      where: {
        sessionId: profile.sessionId,
        recipientDid: callerDid,
      },
    });

    if (!sessionKey) {
      throw new NotFoundError('Profile not found');
    }

    return { profile, sessionKey };
  }

  /**
   * Gets multiple profiles by DIDs, returning only those the caller has access to
   * @param callerDid - The DID of the requesting user
   * @param targetDids - The DIDs of the profile owners
   * @returns Profiles and session keys for accessible profiles
   */
  async getProfiles(
    callerDid: string,
    targetDids: string[],
  ): Promise<{ profiles: PrivateProfile[]; sessionKeys: ProfileSessionKey[] }> {
    // First fetch all profiles for the requested DIDs
    const profiles = await prisma.privateProfile.findMany({
      where: {
        authorDid: { in: targetDids },
      },
    });

    if (profiles.length === 0) {
      return { profiles: [], sessionKeys: [] };
    }

    // Get session keys for all profiles where caller is a recipient
    const sessionIds = profiles.map((p) => p.sessionId);
    const sessionKeys = await prisma.profileSessionKey.findMany({
      where: {
        sessionId: { in: sessionIds },
        recipientDid: callerDid,
      },
    });

    // Filter profiles to only those the caller has access to
    const accessibleSessionIds = new Set(sessionKeys.map((sk) => sk.sessionId));
    const accessibleProfiles = profiles.filter((p) =>
      accessibleSessionIds.has(p.sessionId),
    );

    return { profiles: accessibleProfiles, sessionKeys };
  }

  /**
   * Creates or updates a private profile for the caller
   * @param authorDid - The DID of the profile owner (caller)
   * @param profile - The profile data to save
   * @returns The created/updated profile
   */
  async updateProfile(
    authorDid: string,
    profile: {
      sessionId: string;
      encryptedContent: string;
      avatarUri?: string;
      bannerUri?: string;
    },
  ): Promise<PrivateProfile> {
    const existingProfile = await prisma.privateProfile.findFirst({
      where: {
        authorDid,
      },
    });

    if (existingProfile) {
      return await prisma.privateProfile.update({
        where: {
          id: existingProfile.id,
        },
        data: {
          sessionId: profile.sessionId,
          encryptedContent: Buffer.from(profile.encryptedContent),
          avatarUri: profile.avatarUri,
          bannerUri: profile.bannerUri,
        },
      });
    } else {
      return await prisma.privateProfile.create({
        data: {
          sessionId: profile.sessionId,
          authorDid,
          encryptedContent: Buffer.from(profile.encryptedContent),
          avatarUri: profile.avatarUri,
          bannerUri: profile.bannerUri,
        },
      });
    }
  }

  /**
   * Deletes the caller's private profile
   * @param authorDid - The DID of the profile owner (caller)
   * @returns Success status
   * @throws NotFoundError if profile doesn't exist
   */
  async deleteProfile(authorDid: string): Promise<{ success: boolean }> {
    const profile = await prisma.privateProfile.findFirst({
      where: {
        authorDid,
      },
    });

    if (!profile) {
      throw new NotFoundError('Profile not found');
    }

    await prisma.privateProfile.delete({
      where: {
        id: profile.id,
      },
    });

    return { success: true };
  }
}
