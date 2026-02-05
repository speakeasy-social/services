import { PrismaClient } from '../generated/prisma-client/index.js';
import { NotFoundError, ValidationError } from '@speakeasy-services/common';
import { getPrismaClient } from '../db.js';

const prisma = getPrismaClient();

export class ProfileService {
  async getProfile(recipientDid: string) {
    const profile = await prisma.privateProfile.findFirst({
      where: {
        authorDid: recipientDid,
      },
    });

    if (!profile) {
      throw new NotFoundError('Profile not found');
    }

    return profile;
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
