import { fetchBlueskyProfile } from '@speakeasy-services/common';
import type { PrismaClient } from '../generated/prisma-client/index.js';
import type { PopulateDidCacheJob } from './types.js';

export function createPopulateDidCacheHandler(prisma: PrismaClient) {
  return async (job: { data: PopulateDidCacheJob }) => {
    const { dids, host } = job.data;

    const existingDids = (
      await prisma.userDidCache.findMany({
        where: {
          userDid: {
            in: dids,
          },
        },
        select: { userDid: true },
      })
    ).map((did) => did.userDid);

    // Remove existing dids from the did list
    const newDids = dids.filter((did) => !existingDids.includes(did));

    for (const did of newDids) {
      const profile = await fetchBlueskyProfile(did, {
        host,
      });
      await prisma.userDidCache.create({
        data: {
          userDid: did,
          handle: profile.handle,
        },
      });
    }
  };
}
