import { NotFoundError, safeAtob } from '@speakeasy-services/common';
import type { SafeText } from '@speakeasy-services/common';
import { getPrismaClient } from '../db.js';

const prisma = getPrismaClient();

export class ProfileService {
  async getProfile(viewerDid: string, targetDid: string) {
    const profile = await prisma.privateProfile.findFirst({
      where: {
        authorDid: targetDid,
      },
      include: {
        session: {
          include: {
            sessionKeys: {
              where: { recipientDid: viewerDid },
              take: 1,
            },
          },
        },
      },
    });

    // Return 404 if profile not found OR viewer has no session key access
    if (!profile || !profile.session?.sessionKeys?.length) {
      throw new NotFoundError('Profile not found');
    }

    return profile;
  }

  async getProfiles(viewerDid: string, targetDids: string[]) {
    const profiles = await prisma.privateProfile.findMany({
      where: {
        authorDid: { in: targetDids },
        session: {
          sessionKeys: {
            some: { recipientDid: viewerDid },
          },
        },
      },
      include: {
        session: {
          include: {
            sessionKeys: {
              where: { recipientDid: viewerDid },
              take: 1,
            },
          },
        },
      },
    });

    return profiles;
  }

  async updateProfile(
    authorDid: string,
    profile: {
      sessionId: string;
      encryptedContent: SafeText;
      avatarUri?: string;
      bannerUri?: string;
    },
  ) {
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
          encryptedContent: safeAtob(profile.encryptedContent),
          avatarUri: profile.avatarUri,
          bannerUri: profile.bannerUri,
        },
      });
    } else {
      return await prisma.privateProfile.create({
        data: {
          sessionId: profile.sessionId,
          authorDid,
          encryptedContent: safeAtob(profile.encryptedContent),
          avatarUri: profile.avatarUri,
          bannerUri: profile.bannerUri,
        },
      });
    }
  }

  async getExcludedProfileDids(
    dids: string[],
    viewerDid?: string,
  ): Promise<string[]> {
    if (dids.length === 0) return [];

    // Find which input DIDs have a private profile
    const profileDids = await prisma.privateProfile.findMany({
      where: { authorDid: { in: dids } },
      select: { authorDid: true, sessionId: true },
    });

    if (profileDids.length === 0) return [];

    // If no viewer, all DIDs with private profiles are excluded
    if (!viewerDid) {
      return profileDids.map((p) => p.authorDid);
    }

    // Find which of those profiles the viewer has session key access to
    const sessionIds = profileDids.map((p) => p.sessionId);
    const accessibleKeys = await prisma.sessionKey.findMany({
      where: {
        sessionId: { in: sessionIds },
        recipientDid: viewerDid,
      },
      select: { sessionId: true },
    });

    const accessibleSessionIds = new Set(
      accessibleKeys.map((k) => k.sessionId),
    );

    // Return DIDs where the viewer does NOT have access
    return profileDids
      .filter((p) => !accessibleSessionIds.has(p.sessionId))
      .map((p) => p.authorDid);
  }

  async deleteProfile(authorDid: string) {
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
