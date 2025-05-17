import nock from 'nock';

import server from '../../../src/server.js';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import {
  ApiTest,
  authorizationTransformer,
  runApiTests,
  generateTestToken,
  mockBlueskySession,
  nockXrpc,
  cleanupBlueskySessionMocks,
  verifyBlueskySessionMocks,
} from '@speakeasy-services/test-utils';

const authorDid = 'did:example:alex-author';
const validRecipient = 'did:example:valid-valery';
const invalidRecipient = 'did:example:deleted-dave';

let prisma: PrismaClient;
const validToken = generateTestToken(authorDid);

describe('Trusted Users API Tests', () => {
  beforeAll(async () => {
    // Initialize Prisma client
    prisma = new PrismaClient();
    await prisma.$connect();

    await server.start();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    // @ts-ignore - shutdown is private but we need it for tests
    await server.shutdown();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await prisma.trustedUser.deleteMany();
    // Setup mock for Bluesky session validation
    mockBlueskySession({ did: authorDid });
  });

  afterEach(() => {
    nock.cleanAll();
    // Cleanup and verify mocks
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  const apiTests: ApiTest[] = [
    {
      note: 'empty list',
      endpoint: 'social.spkeasy.graph.getTrusted',
      query: { did: authorDid },
      bearer: validToken,
      expectedBody: {
        trusted: [],
      },
    },
    {
      note: 'with trusted users',
      endpoint: 'social.spkeasy.graph.getTrusted',
      query: { did: authorDid },
      bearer: validToken,
      before: async () => {
        await prisma.trustedUser.create({
          data: {
            authorDid,
            recipientDid: validRecipient,
            createdAt: new Date(),
          },
        });
        // Ignores deleted trusts
        await prisma.trustedUser.create({
          data: {
            authorDid,
            recipientDid: invalidRecipient,
            createdAt: new Date(),
            deletedAt: new Date(),
          },
        });
      },
      expectedBody: {
        trusted: [{ did: validRecipient }],
      },
    },
    {
      note: 'new user',
      method: 'post',
      endpoint: 'social.spkeasy.graph.addTrusted',
      body: { recipientDid: validRecipient },
      bearer: validToken,
      before: async () => {
        nockAddUserToSession();
        // Create another revipiend just to ensure we don't get confused
        await prisma.trustedUser.create({
          data: {
            authorDid,
            recipientDid: invalidRecipient,
            createdAt: new Date(),
            deletedAt: new Date(),
          },
        });
      },
      expectedBody: { success: true },
      describe: newTrustedUser,
    },
    {
      note: 'duplicate trust not allowed',
      method: 'post',
      endpoint: 'social.spkeasy.graph.addTrusted',
      body: { recipientDid: validRecipient },
      bearer: validToken,
      before: async () => {
        await prisma.trustedUser.create({
          data: {
            authorDid,
            recipientDid: validRecipient,
            createdAt: new Date(),
          },
        });
      },
      expectedStatus: 400,
      expectedBody: { code: 'AlreadyExists', error: 'User is already trusted' },
    },
    {
      note: 're-trusting is ok',
      method: 'post',
      endpoint: 'social.spkeasy.graph.addTrusted',
      body: { recipientDid: validRecipient },
      bearer: validToken,
      before: async () => {
        nockAddUserToSession();
        await prisma.trustedUser.create({
          data: {
            authorDid,
            recipientDid: validRecipient,
            createdAt: new Date(),
            deletedAt: new Date(),
          },
        });
      },
      expectedStatus: 200,
      expectedBody: { success: true },
    },
    {
      note: 'existing user',
      method: 'post',
      endpoint: 'social.spkeasy.graph.removeTrusted',
      body: { recipientDid: validRecipient },
      bearer: validToken,
      before: async () => {
        nockRevokeSession();

        await prisma.trustedUser.create({
          data: {
            authorDid,
            recipientDid: validRecipient,
            createdAt: new Date(),
          },
        });
      },
      expectedBody: { success: true },
      describe: removeTrustedUser,
    },
    {
      note: 'non-existent user',
      method: 'post',
      endpoint: 'social.spkeasy.graph.removeTrusted',
      body: { recipientDid: invalidRecipient },
      bearer: validToken,
      expectedStatus: 404,
      expectedBody: { error: 'User is not trusted' },
    },
  ];

  runApiTests(
    { server, testTransformers: [authorizationTransformer] },
    apiTests,
    'Trusted Users API Tests',
  );
});

let addUserNock: nock.Scope;
let revokeSessionNock: nock.Scope;

function nockAddUserToSession() {
  addUserNock = nockXrpc(
    process.env.PRIVATE_SESSIONS_HOST!,
    'post',
    'social.spkeasy.privateSession.addUser',
    {
      authorDid,
      recipientDid: validRecipient,
    },
  );
}

function nockRevokeSession() {
  revokeSessionNock = nockXrpc(
    process.env.PRIVATE_SESSIONS_HOST!,
    'post',
    'social.spkeasy.privateSession.revokeSession',
    {
      authorDid,
      recipientDid: validRecipient,
    },
  );
}

function newTrustedUser() {
  it('creates new trust entry', async () => {
    const trust = await prisma.trustedUser.findFirst({
      where: {
        authorDid,
        recipientDid: validRecipient,
        deletedAt: null,
      },
    });
    expect(trust).toBeTruthy();
  });

  it('adds user to session', () => {
    expect(addUserNock.isDone()).toBeTruthy();
  });
}

function removeTrustedUser() {
  it('deletes the trust entry', async () => {
    const trust = await prisma.trustedUser.findFirst({
      where: {
        authorDid,
        recipientDid: validRecipient,
      },
    });
    expect(trust).toBeTruthy();
    expect(trust?.deletedAt).not.toBeNull();
  });
  it('revokes session', () => {
    expect(revokeSessionNock.isDone()).toBeTruthy();
  });
}
