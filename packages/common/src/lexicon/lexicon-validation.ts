import { z } from 'zod';
import { LexiconDoc } from '@atproto/lexicon';
import { ValidationError } from '@speakeasy-services/common';

type LexiconDefinition = {
  type: string;
  parameters?: {
    type: string;
    required?: string[];
    properties?: Record<string, any>;
  };
  input?: {
    encoding: string;
    schema: {
      type: string;
      required?: string[];
      properties?: Record<string, any>;
    };
  };
  required?: string[];
  properties?: Record<string, any>;
};

/**
 * Converts an AT Protocol lexicon schema to a Zod schema
 * @param lexicon - The AT Protocol lexicon document to convert
 * @param defName - The name of the definition to convert (defaults to 'main')
 * @returns A Zod schema that validates against the lexicon definition
 */
function lexiconToZodSchema(
  lexicon: LexiconDoc,
  defName: string = 'main',
): z.ZodType<any> {
  const def = lexicon.defs[defName] as LexiconDefinition;
  if (!def) {
    throw new Error(`Definition ${defName} not found in lexicon`);
  }

  const schema = def.parameters || def.input?.schema || def;
  if (!schema) {
    return z.object({});
  }

  const properties = schema.properties || {};
  const required = schema.required || [];

  const zodSchema: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    const propDef = prop as any;
    let zodType: z.ZodTypeAny;

    switch (propDef.type) {
      case 'string':
        zodType = z.string();
        break;
      case 'number':
        zodType = z.number();
        break;
      case 'boolean':
        zodType = z.union([
          z.boolean(),
          z.string().transform((val) => val === 'true'),
        ]);
        break;
      case 'integer':
        zodType = z.union([
          z.number().int(),
          z.string().transform((val) => parseInt(val, 10)),
        ]);
        break;
      case 'array':
        let arraySchema: z.ZodArray<any>;
        if (propDef.items?.type === 'ref') {
          const refDef = propDef.items.ref.split('#')[1];
          arraySchema = z.array(lexiconToZodSchema(lexicon, refDef));
        } else {
          arraySchema = z.array(z.string());
        }
        if (typeof propDef.minLength === 'number') {
          arraySchema = arraySchema.min(propDef.minLength);
        }
        if (typeof propDef.maxLength === 'number') {
          arraySchema = arraySchema.max(propDef.maxLength);
        }
        if (propDef.items?.type !== 'ref') {
          zodType = z.union([
            arraySchema,
            z.string().transform((val) => [val]),
          ]);
        } else {
          zodType = arraySchema;
        }
        break;
      case 'ref':
        const refDef = propDef.ref.split('#')[1];
        zodType = lexiconToZodSchema(lexicon, refDef);
        break;
      default:
        zodType = z.unknown();
    }

    if (propDef.description) {
      zodType = zodType.describe(propDef.description);
    }

    if (!required.includes(key)) {
      zodType = zodType.optional();
    }

    zodSchema[key] = zodType;
  }

  return z.object(zodSchema);
}

/**
 * Validates input against a lexicon schema using Zod
 * @param lexicon - The AT Protocol lexicon document to validate against
 * @param input - The input data to validate
 * @returns The validated data if successful
 * @throws {ValidationError} If validation fails, with details about what failed
 */
export function validateAgainstLexicon(
  lexicon: LexiconDoc,
  input: unknown,
): any {
  try {
    const schema = lexiconToZodSchema(lexicon);
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => {
        const path = issue.path.join('.');
        return `${path}: ${issue.message}`;
      });
      throw new ValidationError(`Validation failed: ${issues.join(', ')}`);
    }
    throw error;
  }
}
