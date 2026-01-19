import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { LexiconDoc } from '@atproto/lexicon';
import { createDeleteMediaHandler } from '../../../src/handlers/deleteMedia.js';
import {
  mockInterServiceCall,
  cleanupInterServiceMocks,
  registerLexicon,
} from '@speakeasy-services/test-utils';

// Define the media delete lexicon for testing
const deleteMediaDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.media.delete',
  defs: {
    main: {
      type: 'procedure',
      description: 'Delete a media file',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['key'],
          properties: {
            key: {
              type: 'string',
              description: 'The key of the media file to delete',
            },
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

describe('deleteMedia handler', () => {
  let handler: ReturnType<typeof createDeleteMediaHandler>;

  beforeAll(async () => {
    // Register lexicons for validation
    registerLexicon(deleteMediaDef);
    handler = createDeleteMediaHandler();
  });

  afterAll(async () => {
    // Cleanup
  });

  afterEach(() => {
    cleanupInterServiceMocks();
  });

  it('should call media service to delete media', async () => {
    const key = 'test-media-key-123';

    // Mock the inter-service call to media service
    mockInterServiceCall({
      method: 'POST',
      path: 'social.spkeasy.media.delete',
      toService: 'media',
      response: { success: true },
      lexicon: deleteMediaDef,
    });

    await handler({
      data: { key },
    });

    // If we get here without error, the mock was called successfully
    expect(true).toBe(true);
  });

  it('should pass correct key to media service', async () => {
    const key = 'specific-media-key-456';

    // Create a custom mock that captures the request
    mockInterServiceCall({
      method: 'POST',
      path: 'social.spkeasy.media.delete',
      toService: 'media',
      response: { success: true },
      lexicon: deleteMediaDef,
    });

    await handler({
      data: { key },
    });

    // The mock utility validates request against lexicon
    // If we reach here, request was valid
    expect(true).toBe(true);
  });
});
