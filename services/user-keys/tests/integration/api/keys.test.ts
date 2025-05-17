import nock from 'nock';

import server from '../../../src/server.js';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import {
  ApiTest,
  authorizationTransformer,
  generateTestToken,
  runApiTests,
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

describe('User Keys API Tests', () => {
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
    await prisma.userKey.deleteMany();
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
      note: 'generates key if none exists',
      endpoint: 'social.spkeasy.key.getPublicKey',
      query: { did: authorDid },
      bearer: validToken,
      expectedBody: {
        // FIXME validate key is encoded correctly
        recipientDid: authorDid,
      },
      assert: async () => {
        const key = await prisma.userKey.findFirst({
          where: {
            authorDid: validRecipient,
            deletedAt: null,
          },
        });
        expect(key).toBeTruthy();
        throw new Error('validate that key is encoded correctly');
      },
    },
    {
      note: 'finds existing key',
      endpoint: 'social.spkeasy.key.getPublicKey',
      query: { did: authorDid },
      bearer: validToken,
      before: async () => {
        await prisma.userKey.create({
          data: {
            authorDid,
            recipientDid: validRecipient,
            createdAt: new Date(),
          },
        });
        // Ignores deleted keys
        await prisma.userKey.create({
          data: {
            authorDid,
            recipientDid: invalidRecipient,
            createdAt: new Date(),
            deletedAt: new Date(),
          },
        });
      },
      expectedBody: {
        recipientDid: authorDid,
      },
      assert: async () => {
        // validate that no new keys were created
      },
    },
    {
      note: 'unknown user',
      method: 'get',
      endpoint: 'social.spkeasy.key.getPrivateKey',
      body: { recipientDid: validRecipient },
      bearer: validToken,
      status: 400,
    },
    {
      method: 'get',
      endpoint: 'social.spkeasy.key.getPrivateKey',
      body: { recipientDid: validRecipient },
      bearer: validToken,
      before: async () => {
        throw new Error('fixme create the key');
      },
      expectedBody: {
        authorDid,
      },
    },
    {
      method: 'get',
      endpoint: 'social.spkeasy.key.getPrivateKeys',
      body: { recipientDid: validRecipient },
      bearer: validToken,
      before: async () => {
        // FIXME
        await prisma.userKey.create({
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
      method: 'post',
      endpoint: 'social.spkeasy.key.rotate',
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
  ];

  runApiTests(
    { server, testTransformers: [authorizationTransformer] },
    apiTests,
    'Trusted Users API Tests',
  );
});
