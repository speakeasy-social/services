import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';

// Note: The populateDidCache handler makes external calls to Bluesky's public API.
// We test the database operations separately here.

const testDid1 = 'did:example:user1';
const testDid2 = 'did:example:user2';

describe('populateDidCache database operations', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.userDidCache.deleteMany();
  });

  it('should find existing DIDs in cache', async () => {
    // Create cached DIDs
    await prisma.userDidCache.createMany({
      data: [
        { userDid: testDid1, handle: 'user1.bsky.social' },
        { userDid: testDid2, handle: 'user2.bsky.social' },
      ],
    });

    const existingDids = (
      await prisma.userDidCache.findMany({
        where: {
          userDid: {
            in: [testDid1, testDid2, 'did:example:user3'],
          },
        },
        select: { userDid: true },
      })
    ).map((did) => did.userDid);

    expect(existingDids).toHaveLength(2);
    expect(existingDids).toContain(testDid1);
    expect(existingDids).toContain(testDid2);
    expect(existingDids).not.toContain('did:example:user3');
  });

  it('should filter out existing DIDs correctly', async () => {
    // Create one cached DID
    await prisma.userDidCache.create({
      data: { userDid: testDid1, handle: 'user1.bsky.social' },
    });

    const dids = [testDid1, testDid2];

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

    // Filter logic from the handler
    const newDids = dids.filter((did) => !existingDids.includes(did));

    expect(newDids).toHaveLength(1);
    expect(newDids).toContain(testDid2);
    expect(newDids).not.toContain(testDid1);
  });

  it('should create new cache entries', async () => {
    const newDid = 'did:example:newuser';
    const handle = 'newuser.bsky.social';

    await prisma.userDidCache.create({
      data: {
        userDid: newDid,
        handle,
      },
    });

    const cached = await prisma.userDidCache.findUnique({
      where: { handle },
    });

    expect(cached).toBeDefined();
    expect(cached?.userDid).toBe(newDid);
  });

  it('should handle empty DID list', async () => {
    const dids: string[] = [];

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

    expect(existingDids).toHaveLength(0);
  });
});
