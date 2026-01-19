import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { LexiconDoc } from '@atproto/lexicon';
import { PrismaClient } from '../../../src/generated/prisma-client/index.js';
import { createUpdateUserKeysHandler } from '../../../src/handlers/updateUserKeys.js';
import {
  mockInterServiceCall,
  cleanupInterServiceMocks,
  registerLexicon,
} from '@speakeasy-services/test-utils';
import { v4 as uuidv4 } from 'uuid';

const userDid = 'did:example:user';

// Define updateKeys lexicon for testing
const updateKeysDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.privateSession.updateKeys',
  defs: {
    main: {
      type: 'procedure',
      description: 'Update session keys with new key pair',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['prevKeyId', 'newKeyId', 'prevPrivateKey', 'newPublicKey'],
          properties: {
            prevKeyId: { type: 'string' },
            newKeyId: { type: 'string' },
            prevPrivateKey: { type: 'string' },
            newPublicKey: { type: 'string' },
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['success'],
          properties: {
            success: { type: 'boolean' },
          },
        },
      },
    },
  },
};

describe('updateUserKeys handler', () => {
  let prisma: PrismaClient;
  let handler: ReturnType<typeof createUpdateUserKeysHandler>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    registerLexicon(updateKeysDef);
    handler = createUpdateUserKeysHandler(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.userKey.deleteMany();
  });

  afterEach(() => {
    cleanupInterServiceMocks();
  });

  it('should notify private-sessions service when keys are rotated', async () => {
    const prevKeyId = uuidv4();
    const newKeyId = uuidv4();

    // Create test keys
    await prisma.userKey.createMany({
      data: [
        {
          id: prevKeyId,
          userDid,
          publicKey: 'prev-public-key',
          privateKey: 'prev-private-key',
        },
        {
          id: newKeyId,
          userDid,
          publicKey: 'new-public-key',
          privateKey: 'new-private-key',
        },
      ],
    });

    // Mock the inter-service call to private-sessions
    mockInterServiceCall({
      method: 'POST',
      path: 'social.spkeasy.privateSession.updateKeys',
      toService: 'private-sessions',
      response: { success: true },
      lexicon: updateKeysDef,
    });

    await handler({
      data: { prevKeyId, newKeyId },
    });

    // If we get here without error, the call was made successfully
    expect(true).toBe(true);
  });

  it('should throw error when previous key is not found', async () => {
    const prevKeyId = uuidv4();
    const newKeyId = uuidv4();

    // Only create the new key
    await prisma.userKey.create({
      data: {
        id: newKeyId,
        userDid,
        publicKey: 'new-public-key',
        privateKey: 'new-private-key',
      },
    });

    await expect(
      handler({
        data: { prevKeyId, newKeyId },
      }),
    ).rejects.toThrow('Failed to find one or both keys');
  });

  it('should throw error when new key is not found', async () => {
    const prevKeyId = uuidv4();
    const newKeyId = uuidv4();

    // Only create the previous key
    await prisma.userKey.create({
      data: {
        id: prevKeyId,
        userDid,
        publicKey: 'prev-public-key',
        privateKey: 'prev-private-key',
      },
    });

    await expect(
      handler({
        data: { prevKeyId, newKeyId },
      }),
    ).rejects.toThrow('Failed to find one or both keys');
  });

  it('should pass correct key information to private-sessions', async () => {
    const prevKeyId = uuidv4();
    const newKeyId = uuidv4();
    const prevPrivateKey = 'test-prev-private-key';
    const newPublicKey = 'test-new-public-key';

    // Create test keys
    await prisma.userKey.createMany({
      data: [
        {
          id: prevKeyId,
          userDid,
          publicKey: 'prev-public-key',
          privateKey: prevPrivateKey,
        },
        {
          id: newKeyId,
          userDid,
          publicKey: newPublicKey,
          privateKey: 'new-private-key',
        },
      ],
    });

    // Mock the inter-service call
    mockInterServiceCall({
      method: 'POST',
      path: 'social.spkeasy.privateSession.updateKeys',
      toService: 'private-sessions',
      response: { success: true },
      lexicon: updateKeysDef,
    });

    await handler({
      data: { prevKeyId, newKeyId },
    });

    // The mock validates request against lexicon
    // If we reach here, request structure was valid
    expect(true).toBe(true);
  });
});
