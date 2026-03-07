import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import { createNotifyReactionHandler } from '../../../src/handlers/notifyReaction.js';
import { v4 as uuidv4 } from 'uuid';

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
    await prisma.reaction.deleteMany();
    await prisma.mediaPost.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.encryptedPost.deleteMany();
    await prisma.sessionKey.deleteMany();
    await prisma.session.deleteMany();
  });

  it("should create notification when user reacts to another user's post", async () => {
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
      pending: false,
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

  describe('pending reply notification activation', () => {
    const replyAuthorDid = 'did:example:reply-author';
    const recipientDid = 'did:example:recipient';
    let sessionId: string;
    let postUri: string;

    beforeEach(async () => {
      sessionId = uuidv4();
      postUri = `at://${replyAuthorDid}/social.spkeasy.feed.privatePost/reply123`;

      // Create session and post for the reply
      await prisma.session.create({
        data: {
          id: sessionId,
          authorDid: replyAuthorDid,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await prisma.encryptedPost.create({
        data: {
          uri: postUri,
          authorDid: replyAuthorDid,
          rkey: 'reply123',
          langs: ['en'],
          encryptedContent: Buffer.from('content'),
          sessionId,
          replyUri: `at://${recipientDid}/social.spkeasy.feed.privatePost/parent123`,
        },
      });

      // Create a pending reply notification (as notifyReply would for untrusted users)
      await prisma.notification.create({
        data: {
          id: uuidv4(),
          userDid: recipientDid,
          authorDid: replyAuthorDid,
          reason: 'reply',
          reasonSubject: postUri,
          pending: true,
          notifiedAt: new Date(0),
          updatedAt: new Date(),
        },
      });
    });

    it('should not activate pending notifications with fewer than 2 likes', async () => {
      // Add 1 reaction
      await prisma.reaction.create({
        data: { id: uuidv4(), userDid: 'did:example:liker1', uri: postUri },
      });

      await handler({
        data: { authorDid: 'did:example:liker1', uri: postUri },
      });

      const notification = await prisma.notification.findFirst({
        where: { reason: 'reply', reasonSubject: postUri },
      });

      expect(notification?.pending).toBe(true);
    });

    it('should activate pending reply notifications when post reaches 2 likes', async () => {
      // Add 2 reactions
      await prisma.reaction.createMany({
        data: [
          { id: uuidv4(), userDid: 'did:example:liker1', uri: postUri },
          { id: uuidv4(), userDid: 'did:example:liker2', uri: postUri },
        ],
      });

      const beforeActivation = new Date();

      await handler({
        data: { authorDid: 'did:example:liker2', uri: postUri },
      });

      const notification = await prisma.notification.findFirst({
        where: { reason: 'reply', reasonSubject: postUri },
      });

      expect(notification?.pending).toBe(false);
      expect(notification?.readAt).toBeNull();
      expect(notification!.notifiedAt.getTime()).toBeGreaterThanOrEqual(
        beforeActivation.getTime(),
      );
    });

    it('should reset readAt when activating (in case updateSeen ran while pending)', async () => {
      // Simulate updateSeen having run while notification was pending
      await prisma.notification.updateMany({
        where: { reason: 'reply', reasonSubject: postUri },
        data: { readAt: new Date() },
      });

      // Add 2 reactions
      await prisma.reaction.createMany({
        data: [
          { id: uuidv4(), userDid: 'did:example:liker1', uri: postUri },
          { id: uuidv4(), userDid: 'did:example:liker2', uri: postUri },
        ],
      });

      await handler({
        data: { authorDid: 'did:example:liker2', uri: postUri },
      });

      const notification = await prisma.notification.findFirst({
        where: { reason: 'reply', reasonSubject: postUri },
      });

      expect(notification?.pending).toBe(false);
      expect(notification?.readAt).toBeNull();
    });

    it('should not affect already-activated notifications on subsequent likes', async () => {
      // Activate with 2 likes
      await prisma.reaction.createMany({
        data: [
          { id: uuidv4(), userDid: 'did:example:liker1', uri: postUri },
          { id: uuidv4(), userDid: 'did:example:liker2', uri: postUri },
        ],
      });

      await handler({
        data: { authorDid: 'did:example:liker2', uri: postUri },
      });

      const afterFirstActivation = await prisma.notification.findFirst({
        where: { reason: 'reply', reasonSubject: postUri },
      });
      const firstNotifiedAt = afterFirstActivation!.notifiedAt;

      // Mark as read
      await prisma.notification.updateMany({
        where: { reason: 'reply', reasonSubject: postUri },
        data: { readAt: new Date() },
      });

      // 3rd like should not change anything (already pending=false)
      await prisma.reaction.create({
        data: { id: uuidv4(), userDid: 'did:example:liker3', uri: postUri },
      });

      await handler({
        data: { authorDid: 'did:example:liker3', uri: postUri },
      });

      const afterThirdLike = await prisma.notification.findFirst({
        where: { reason: 'reply', reasonSubject: postUri },
      });

      // readAt should still be set (not reset), notifiedAt unchanged
      expect(afterThirdLike?.readAt).not.toBeNull();
      expect(afterThirdLike?.notifiedAt.getTime()).toBe(
        firstNotifiedAt.getTime(),
      );
    });
  });
});
