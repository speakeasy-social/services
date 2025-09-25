import { LexiconDoc } from '@atproto/lexicon';

export const createTestimonialDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.testimonial.create',
  defs: {
    main: {
      type: 'procedure',
      description: 'Write a note about why you support Speakeasy',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string' },
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string' },
          },
        },
      },
    },
  },
};
