import { NotFoundError } from '@speakeasy-services/common';
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
      encryptedContent: string;
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
