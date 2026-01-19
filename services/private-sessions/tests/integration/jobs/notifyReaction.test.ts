import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import { createNotifyReactionHandler } from '../../../src/handlers/notifyReaction.js';

const authorDid = 'did:example:author';
const postOwnerDid = 'did:example:post-owner';

describe('notifyReaction handler', () => {
  let prisma: PrismaClient;
  let handler: ReturnType<typeof createNotifyReactionHandler>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    handler = createNotifyReactionHandler(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.notification.deleteMany();
  });

  it('should create notification when user reacts to another user\'s post', async () => {
    const uri = `at://${postOwnerDid}/social.spkeasy.privatePost/post123`;

    await handler({
      data: {
        authorDid,
        uri,
      },
    });

    const notifications = await prisma.notification.findMany({
      where: { userDid: postOwnerDid },
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      userDid: postOwnerDid,
      authorDid,
      reason: 'like',
      reasonSubject: uri,
    });
  });

  it('should not create notification when user reacts to their own post', async () => {
    const uri = `at://${authorDid}/social.spkeasy.privatePost/post123`;

    await handler({
      data: {
        authorDid,
        uri,
      },
    });

    const notifications = await prisma.notification.findMany();
    expect(notifications).toHaveLength(0);
  });

  it('should silently ignore duplicate reactions', async () => {
    const uri = `at://${postOwnerDid}/social.spkeasy.privatePost/post123`;

    // First reaction
    await handler({
      data: {
        authorDid,
        uri,
      },
    });

    // Duplicate reaction - should not throw
    await handler({
      data: {
        authorDid,
        uri,
      },
    });

    const notifications = await prisma.notification.findMany({
      where: { userDid: postOwnerDid },
    });

    // Log for debugging
    console.log('Notifications:', JSON.stringify(notifications, null, 2));

    // Should still only have one notification
    expect(notifications).toHaveLength(1);
  });

  it('should extract correct userDid from uri', async () => {
    const differentOwner = 'did:example:different-owner';
    const uri = `at://${differentOwner}/social.spkeasy.privatePost/post456`;

    await handler({
      data: {
        authorDid,
        uri,
      },
    });

    const notifications = await prisma.notification.findMany();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].userDid).toBe(differentOwner);
  });
});
