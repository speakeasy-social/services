import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import server from '../../../src/server.js';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import {
  mockBlueskySession,
  cleanupBlueskySessionMocks,
  verifyBlueskySessionMocks,
  generateTestToken,
} from '@speakeasy-services/test-utils';
import { Queue } from '@speakeasy-services/queue';
import request from 'supertest';

const authorDid = 'did:example:alex-author';
const anotherUserDid = 'did:example:bob-user';

describe('User Keys API Tests', () => {
  let prisma: PrismaClient;
  const validToken = generateTestToken(authorDid);

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
    
    // Setup mock for Bluesky session validation - use localhost in test mode
    mockBlueskySession({ did: authorDid, host: 'http://localhost:2583' });
  });

  afterEach(() => {
    // Cleanup and verify mocks
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  describe('getPublicKey endpoint', () => {
    it('should get public key for existing user', async () => {
      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.key.getPublicKey')
        .query({ did: authorDid })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual({
        publicKey: expect.any(String),
        recipientDid: authorDid,
        userKeyPairId: expect.any(String),
      });
    });

    it('should get public key for new user (creates key)', async () => {
      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.key.getPublicKey')
        .query({ did: anotherUserDid })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual({
        publicKey: expect.any(String),
        recipientDid: anotherUserDid,
        userKeyPairId: expect.any(String),
      });

      // Verify that a key was created in the database
      const key = await prisma.userKey.findFirst({
        where: { authorDid: anotherUserDid, deletedAt: null },
      });
      expect(key).toBeTruthy();
      expect(key?.publicKey).toBeInstanceOf(Uint8Array);
    });
  });

  describe('getPublicKeys endpoint', () => {
    it('should get multiple public keys', async () => {
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

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.key.getPublicKeys')
        .query({ dids: `${authorDid},${anotherUserDid}` })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual({
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
      });
    });
  });

  describe('getPrivateKey endpoint', () => {
    it('should get private key for authenticated user', async () => {
      // Create a key for the user
      await prisma.userKey.create({
        data: {
          authorDid,
          publicKey: Buffer.from('test-public-key'),
          privateKey: Buffer.from('test-private-key'),
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.key.getPrivateKey')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual({
        privateKey: expect.any(String),
        authorDid: authorDid,
        userKeyPairId: expect.any(String),
      });
    });
  });

  describe('getPrivateKeys endpoint', () => {
    it('should get private keys by IDs', async () => {
      // Create keys for two different users to avoid unique constraint
      const key1 = await prisma.userKey.create({
        data: {
          authorDid,
          publicKey: Buffer.from('test-public-key-1'),
          privateKey: Buffer.from('test-private-key-1'),
        },
      });
      
      const key2 = await prisma.userKey.create({
        data: {
          authorDid: anotherUserDid,
          publicKey: Buffer.from('test-public-key-2'),
          privateKey: Buffer.from('test-private-key-2'),
        },
      });

      const response = await request(server.express)
        .get('/xrpc/social.spkeasy.key.getPrivateKeys')
        .query({ did: authorDid, ids: [key1.id, key2.id] })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      // Should only return the key that matches the user's DID
      expect(response.body).toEqual({
        keys: [
          {
            privateKey: expect.any(String),
            authorDid: authorDid,
            userKeyPairId: expect.any(String),
          },
        ],
      });
    });
  });

  describe('rotate key endpoint', () => {
    it('should rotate key for authenticated user', async () => {
      // Create an existing key that's older than 5 minutes
      await prisma.userKey.create({
        data: {
          authorDid,
          publicKey: Buffer.from('old-public-key'),
          privateKey: Buffer.from('old-private-key'),
          createdAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago
        },
      });

      const response = await request(server.express)
        .post('/xrpc/social.spkeasy.key.rotate')
        .send({
          publicKey: 'bmV3LXB1YmxpYy1rZXk=', // base64 encoded "new-public-key"
          privateKey: 'bmV3LXByaXZhdGUta2V5', // base64 encoded "new-private-key"
        })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual({
        publicKey: expect.any(String),
        recipientDid: authorDid,
        userKeyPairId: expect.any(String),
      });

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
      expect(newKey?.publicKey).toEqual(new Uint8Array(Buffer.from('new-public-key')));
      expect(newKey?.privateKey).toEqual(new Uint8Array(Buffer.from('new-private-key')));
    });
  });
});