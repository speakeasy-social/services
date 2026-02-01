import { LexiconDoc } from '@atproto/lexicon';

export const createTestimonialDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.createTestimonial',
  defs: {
    main: {
      type: 'procedure',
      description: 'Write a note about why you support Speakeasy',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['content'],
          properties: {
            content: {
              type: 'unknown',
              description: 'Content object with text (required, max 300 chars) and optional facets array',
            },
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['id', 'createdAt'],
          properties: {
            id: { type: 'string', description: 'UUID of created testimonial' },
            createdAt: { type: 'string', format: 'datetime' },
          },
        },
      },
    },
  },
};

export const listTestimonialsDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.listTestimonials',
  defs: {
    main: {
      type: 'query',
      description: 'List testimonials, optionally filtered by user',
      parameters: {
        type: 'params',
        properties: {
          did: { type: 'string', description: 'Filter by specific user DID' },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 50,
            description: 'Maximum number of results to return',
          },
          cursor: { type: 'string', description: 'Pagination cursor' },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'ref',
          ref: '#listOutput',
        },
      },
    },
    listOutput: {
      type: 'object',
      required: ['testimonials'],
      properties: {
        testimonials: {
          type: 'array',
          items: {
            type: 'ref',
            ref: '#testimonialView',
          },
        },
        cursor: { type: 'string', description: 'Next page cursor' },
      },
    },
    testimonialView: {
      type: 'object',
      required: ['id', 'did', 'content', 'createdAt'],
      properties: {
        id: { type: 'string' },
        did: { type: 'string' },
        content: { type: 'unknown' },
        createdAt: { type: 'string', format: 'datetime' },
      },
    },
  },
};

export const deleteTestimonialDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.deleteTestimonial',
  defs: {
    main: {
      type: 'procedure',
      description: 'Delete a testimonial',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'UUID of testimonial to delete' },
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

export const checkSupporterDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.checkSupporter',
  defs: {
    main: {
      type: 'query',
      description: 'Check if the authenticated user is a supporter',
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['isSupporter', 'contributions'],
          properties: {
            isSupporter: { type: 'boolean' },
            contributions: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of contribution types for this user',
            },
          },
        },
      },
    },
  },
};
