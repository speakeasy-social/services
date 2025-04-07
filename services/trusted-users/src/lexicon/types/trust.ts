import { LexiconDoc } from '@atproto/lexicon';

export const getTrustsDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.graph.getTrusts',
  defs: {
    main: {
      type: 'query',
      parameters: {
        type: 'params',
        required: ['did'],
        properties: {
          did: { type: 'string' }
        }
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['trusts'],
          properties: {
            trusts: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    }
  }
};

export const addTrustedDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.graph.addTrusted',
  defs: {
    main: {
      type: 'procedure',
      parameters: {
        type: 'params',
        required: ['did'],
        properties: {
          did: { type: 'string' }
        }
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['success'],
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    }
  }
};

export const removeTrustedDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.graph.removeTrusted',
  defs: {
    main: {
      type: 'procedure',
      parameters: {
        type: 'params',
        required: ['did'],
        properties: {
          did: { type: 'string' }
        }
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['success'],
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    }
  }
}; 