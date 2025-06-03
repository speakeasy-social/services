import { LexiconDoc } from '@atproto/lexicon';

export const uploadMediaDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.media.upload',
  defs: {
    main: {
      type: 'procedure',
      description: 'Upload a media file',
      input: {
        encoding: '*/*',
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
          required: ['uri'],
          properties: {
            id: { type: 'string' },
            mimeType: { type: 'string' },
            size: { type: 'integer' },
          },
        },
      },
    },
  },
};
