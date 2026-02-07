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
      required: ['id', 'did', 'content', 'createdAt', 'contributions'],
      properties: {
        id: { type: 'string' },
        did: { type: 'string' },
        content: { type: 'unknown' },
        createdAt: { type: 'string', format: 'datetime' },
        contributions: {
          type: 'array',
          items: { type: 'ref', ref: '#contributionView' },
          description: 'Contribution records for the testimonial author',
        },
      },
    },
    contributionView: {
      type: 'object',
      description:
        'Single contribution entry (public only; internal_data is never returned by the API)',
      required: ['createdAt', 'contribution'],
      nullable: ['public'],
      properties: {
        createdAt: { type: 'string', format: 'datetime' },
        contribution: {
          type: 'string',
          knownValues: ['donor', 'contributor', 'designer', 'engineer', 'testing'],
          description: 'Type of contribution',
        },
        public: {
          type: 'ref',
          ref: '#contributionPublicData',
          description:
            'Public metadata for this contribution. Shape depends on contribution type; null when no public data.',
        },
      },
    },
    contributionPublicData: {
      type: 'object',
      description:
        'Public metadata for a contribution (stored in contributions.public_data). All fields are optional: donor may have recognition and isRegularGift; feature is optional and applicable to all contribution types. Internal metadata (amount, donationId) is stored in internal_data and MUST NOT be returned in API responses.',
      properties: {
        recognition: {
          type: 'string',
          description: 'donor only. Recognition text for the donor.',
        },
        isRegularGift: {
          type: 'boolean',
          description: 'donor only. Whether the donation is a recurring gift.',
        },
        feature: {
          type: 'string',
          description: 'Optional for all contribution types. Name of the feature contributed to (e.g. "dark-mode").',
        },
      },
    },
  },
};

export const updateTestimonialDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.updateTestimonial',
  defs: {
    main: {
      type: 'procedure',
      description: 'Update the content of an existing testimonial',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['id', 'content'],
          properties: {
            id: { type: 'string', description: 'UUID of testimonial to update' },
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
            id: { type: 'string', description: 'UUID of updated testimonial' },
            createdAt: { type: 'string', format: 'datetime' },
          },
        },
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

export const checkContributionDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.checkContribution',
  defs: {
    main: {
      type: 'query',
      description: 'Check if the authenticated user is a contributor',
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['isContributor', 'contributions'],
          properties: {
            isContributor: { type: 'boolean' },
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
