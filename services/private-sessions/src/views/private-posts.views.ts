import { EncryptedPost } from '../generated/prisma-client/index.js';
import { createView, createListView } from '@speakeasy-services/common';

export type EncryptedPostView = {
  uri: string;
  cid: string;
  authorDid: string;
  encryptedContent: Uint8Array;
  createdAt: string;
  sessionId: string;
  reply: {
    root: string | null;
    parent: string | null;
  };
  langs: string[];
  sessionId: string;
};

/**
 * Create a view that picks recipientDid and createdAt, converting createdAt to ISO string
 */
export function toEncryptedPostView(post: EncryptedPost): EncryptedPostView {
  return {
    uri: `at://${post.authorDid}/app.bsky.feed.post/${post.cid}`,
    cid: post.cid,
    authorDid: post.authorDid,
    encryptedContent: post.encryptedContent,
    createdAt: post.createdAt.toISOString(),
    sessionId: post.sessionId,
    reply: {
      root: post.replyRoot,
      parent: post.replyRef,
    },
    langs: post.langs,
    sessionId: post.sessionId,
  };
}

/**
 * Create a list view that maps over the array
 */
export const toEncryptedPostsListView = createListView<
  EncryptedPost,
  EncryptedPostView
>(toEncryptedPostView);
