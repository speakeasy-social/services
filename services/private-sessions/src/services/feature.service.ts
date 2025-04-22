import { PrismaClient, UserFeature } from '../generated/prisma-client/index.js';

const prisma = new PrismaClient();

type SelectedUserFeatures = Pick<UserFeature, 'userDid' | 'key' | 'value'>;

export class FeatureService {
  async getFeatures(userDid: string): Promise<SelectedUserFeatures[]> {
    const features = await prisma.userFeature.findMany({
      where: { userDid },
      select: { userDid: true, key: true, value: true },
    });

    return features;
  }
}
