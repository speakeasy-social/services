import { LexiconDoc } from '@atproto/lexicon';

export const uploadMediaDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.media.upload',
  defs: {
    main: {
      type: 'procedure',
      description: 'Upload a media file',
      input: {
        encoding: 'application/octet-stream',
        schema: {
          type: 'object',
          required: ['file'],
          properties: {
            file: {
              type: 'blob',
              description: 'The media file to upload',
            },
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['media'],
          properties: {
            media: {
              type: 'ref',
              ref: 'social.spkeasy.media',
            },
          },
        },
      },
    },
    media: {
      type: 'object',
      required: ['id', 'key', 'mimeType', 'size', 'createdAt'],
      properties: {
        id: { type: 'string' },
        key: { type: 'string' },
        mimeType: { type: 'string' },
        size: { type: 'integer' },
        createdAt: { type: 'string', format: 'datetime' },
      },
    },
  },
};
