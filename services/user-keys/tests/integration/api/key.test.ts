import server from '../../src/server.js';
import { PrismaClient } from '../../src/generated/prisma-client/index.js';
import {
  ApiTest,
  runApiTests,
  mockBlueskySession,
  cleanupBlueskySessionMocks,
  verifyBlueskySessionMocks,
  generateTestToken,
} from '@speakeasy-services/test-utils';
import { Queue } from '@speakeasy-services/queue';

const authorDid = 'did:example:alex-author';
const anotherUserDid = 'did:example:bob-user';

describe('User Keys API Tests', () => {
  let prisma: PrismaClient;
  const validToken = generateTestToken(authorDid);
  const anotherUserToken = generateTestToken(anotherUserDid);

  beforeAll(async () => {
    // Initialize Prisma client
    prisma = new PrismaClient();
    await prisma.$connect();

    // Start the server
    await server.start();
    
    // Start the queue
    await Queue.start();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await Queue.stop();
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
    // Cleanup and verify mocks
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  const apiTests: ApiTest[] = [
    // Test getPublicKey endpoint
    {
      note: 'get public key for existing user',
      endpoint: 'social.spkeasy.key.getPublicKey',
      query: { did: authorDid },
      expectedBody: {
        publicKey: expect.any(String),
        recipientDid: authorDid,
        userKeyPairId: expect.any(String),
      },
    },
    {
      note: 'get public key for new user (creates key)',
      endpoint: 'social.spkeasy.key.getPublicKey',
      query: { did: anotherUserDid },
      expectedBody: {
        publicKey: expect.any(String),
        recipientDid: anotherUserDid,
        userKeyPairId: expect.any(String),
      },
      assert: async () => {
        // Verify that a key was created in the database
        const key = await prisma.userKey.findFirst({
          where: { authorDid: anotherUserDid, deletedAt: null },
        });
        expect(key).toBeTruthy();
        expect(key?.publicKey).toBeInstanceOf(Buffer);
      },
    },

    // Test getPublicKeys endpoint
    {
      note: 'get multiple public keys',
      endpoint: 'social.spkeasy.key.getPublicKeys',
      query: { dids: `${authorDid},${anotherUserDid}` },
      before: async () => {
        // Create keys for both users
        await prisma.userKey.createMany({
          data: [
            {
              authorDid,
              publicKey: Buffer.from('test-public-key-1'),
              privateKey: Buffer.from('test-private-key-1'),
            },
            {
              authorDid: anotherUserDid,
              publicKey: Buffer.from('test-public-key-2'),
              privateKey: Buffer.from('test-private-key-2'),
            },
          ],
        });
      },
      expectedBody: {
        publicKeys: [
          {
            publicKey: expect.any(String),
            recipientDid: authorDid,
            userKeyPairId: expect.any(String),
          },
          {
            publicKey: expect.any(String),
            recipientDid: anotherUserDid,
            userKeyPairId: expect.any(String),
          },
        ],
      },
    },

    // Test getPrivateKey endpoint
    {
      note: 'get private key for authenticated user',
      endpoint: 'social.spkeasy.key.getPrivateKey',
      bearer: validToken,
      before: async () => {
        // Create a key for the user
        await prisma.userKey.create({
          data: {
            authorDid,
            publicKey: Buffer.from('test-public-key'),
            privateKey: Buffer.from('test-private-key'),
          },
        });
      },
      expectedBody: {
        privateKey: expect.any(String),
        authorDid: authorDid,
        userKeyPairId: expect.any(String),
      },
    },

    // Test getPrivateKeys endpoint
    {
      note: 'get private keys by IDs',
      endpoint: 'social.spkeasy.key.getPrivateKeys',
      query: { did: authorDid, ids: ['key1', 'key2'] },
      bearer: validToken,
      before: async () => {
        // Create keys for the user
        const key1 = await prisma.userKey.create({
          data: {
            authorDid,
            publicKey: Buffer.from('test-public-key-1'),
            privateKey: Buffer.from('test-private-key-1'),
          },
        });
        const key2 = await prisma.userKey.create({
          data: {
            authorDid,
            publicKey: Buffer.from('test-public-key-2'),
            privateKey: Buffer.from('test-private-key-2'),
          },
        });
        // Update the query to use actual key IDs
        return { key1Id: key1.id, key2Id: key2.id };
      },
      expectedBody: {
        keys: [
          {
            privateKey: expect.any(String),
            authorDid: authorDid,
            userKeyPairId: expect.any(String),
          },
          {
            privateKey: expect.any(String),
            authorDid: authorDid,
            userKeyPairId: expect.any(String),
          },
        ],
      },
    },

    // Test rotate key endpoint
    {
      note: 'rotate key for authenticated user',
      method: 'post',
      endpoint: 'social.spkeasy.key.rotate',
      body: {
        publicKey: 'bmV3LXB1YmxpYy1rZXk=', // base64 encoded "new-public-key"
        privateKey: 'bmV3LXByaXZhdGUta2V5', // base64 encoded "new-private-key"
      },
      bearer: validToken,
      before: async () => {
        // Create an existing key that's older than 5 minutes
        await prisma.userKey.create({
          data: {
            authorDid,
            publicKey: Buffer.from('old-public-key'),
            privateKey: Buffer.from('old-private-key'),
            createdAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago
          },
        });
      },
      expectedBody: {
        publicKey: expect.any(String),
        recipientDid: authorDid,
        userKeyPairId: expect.any(String),
      },
      assert: async () => {
        // Verify that the old key was marked as deleted
        const oldKey = await prisma.userKey.findFirst({
          where: { 
            authorDid, 
            publicKey: Buffer.from('old-public-key'),
            deletedAt: { not: null }
          },
        });
        expect(oldKey).toBeTruthy();
        expect(oldKey?.deletedAt).not.toBeNull();

        // Verify that a new key was created
        const newKey = await prisma.userKey.findFirst({
          where: { 
            authorDid, 
            deletedAt: null 
          },
          orderBy: { createdAt: 'desc' },
        });
        expect(newKey).toBeTruthy();
        expect(newKey?.publicKey).toEqual(Buffer.from('new-public-key'));
        expect(newKey?.privateKey).toEqual(Buffer.from('new-private-key'));
      },
    },
  ];

  // Run all the API tests
  runApiTests({ server }, apiTests, 'User Keys API Tests');
});