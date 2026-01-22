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
  output?: {
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
          z
            .enum(['true', 'false', '1', '0'])
            .transform((val) => val === 'true' || val === '1'),
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

/**
 * Converts a lexicon schema object (parameters or input.schema) to a Zod schema
 */
function schemaToZodSchema(
  lexicon: LexiconDoc,
  schema: { type: string; required?: string[]; properties?: Record<string, any> },
): z.ZodType<any> {
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
        zodType = z.boolean();
        break;
      case 'integer':
        zodType = z.number().int();
        break;
      case 'array':
        let arraySchema: z.ZodArray<any>;
        if (propDef.items?.type === 'ref') {
          const refParts = propDef.items.ref.split('#');
          const refDef = refParts.length > 1 ? refParts[1] : refParts[0];
          arraySchema = z.array(lexiconToZodSchema(lexicon, refDef));
        } else if (propDef.items?.type === 'object') {
          arraySchema = z.array(
            schemaToZodSchema(lexicon, propDef.items),
          );
        } else {
          arraySchema = z.array(z.string());
        }
        if (typeof propDef.minLength === 'number') {
          arraySchema = arraySchema.min(propDef.minLength);
        }
        if (typeof propDef.maxLength === 'number') {
          arraySchema = arraySchema.max(propDef.maxLength);
        }
        zodType = arraySchema;
        break;
      case 'ref':
        const refParts = propDef.ref.split('#');
        const refDef = refParts.length > 1 ? refParts[1] : refParts[0];
        zodType = lexiconToZodSchema(lexicon, refDef);
        break;
      case 'blob':
        zodType = z.any();
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
 * Validates input against a lexicon's input schema (parameters for query, input.schema for procedure)
 * @param lexicon - The AT Protocol lexicon document to validate against
 * @param input - The input data to validate
 * @returns The validated data if successful
 * @throws {ValidationError} If validation fails, with details about what failed
 */
export function validateLexiconInput(
  lexicon: LexiconDoc,
  input: unknown,
): any {
  const def = lexicon.defs.main as LexiconDefinition;
  if (!def) {
    throw new Error('Definition main not found in lexicon');
  }

  let schema: { type: string; required?: string[]; properties?: Record<string, any> } | undefined;

  // For queries, use parameters; for procedures, use input.schema or parameters
  if (def.type === 'query') {
    schema = def.parameters;
  } else if (def.type === 'procedure') {
    schema = def.input?.schema || def.parameters;
  }

  if (!schema) {
    // No input schema defined, accept any input
    return input;
  }

  try {
    const zodSchema = schemaToZodSchema(lexicon, schema);
    return zodSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => {
        const path = issue.path.join('.');
        return `${path}: ${issue.message}`;
      });
      throw new ValidationError(
        `Input validation failed for ${lexicon.id}: ${issues.join(', ')}`,
      );
    }
    throw error;
  }
}

/**
 * Validates output against a lexicon's output schema
 * @param lexicon - The AT Protocol lexicon document to validate against
 * @param output - The output data to validate
 * @returns The validated data if successful
 * @throws {ValidationError} If validation fails, with details about what failed
 */
export function validateLexiconOutput(
  lexicon: LexiconDoc,
  output: unknown,
): any {
  const def = lexicon.defs.main as LexiconDefinition;
  if (!def) {
    throw new Error('Definition main not found in lexicon');
  }

  const schema = def.output?.schema;
  if (!schema) {
    // No output schema defined, accept any output
    return output;
  }

  try {
    const zodSchema = schemaToZodSchema(lexicon, schema);
    return zodSchema.parse(output);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => {
        const path = issue.path.join('.');
        return `${path}: ${issue.message}`;
      });
      throw new ValidationError(
        `Output validation failed for ${lexicon.id}: ${issues.join(', ')}`,
      );
    }
    throw error;
  }
}
