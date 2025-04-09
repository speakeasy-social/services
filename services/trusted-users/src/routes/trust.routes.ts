/**
 * XRPC method definitions for trust management
 */

import { TrustService } from "../services/trust.service.js";
import {
  XRPCHandlerConfig,
  XRPCReqContext,
  HandlerOutput,
} from "@atproto/xrpc-server";
import {
  ServiceError,
  ValidationError,
  DatabaseError,
  authorize,
} from "@speakeasy-services/common";
import {
  getTrustedDef,
  addTrustedDef,
  removeTrustedDef,
} from "../lexicon/types/trust.js";

const trustService = new TrustService();

// Helper function to validate against lexicon schema
function validateAgainstLexicon(lexicon: any, params: any) {
  const schema = lexicon.defs.main.parameters;
  if (!schema) return;

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (params[field] === undefined) {
        throw new ValidationError(`${field} is required`);
      }
    }
  }

  // Check field types
  if (schema.properties) {
    for (const [field, def] of Object.entries(schema.properties)) {
      const value = params[field];
      if (value === undefined) continue;

      const type = (def as any).type;
      if (type === "string" && typeof value !== "string") {
        throw new ValidationError(`${field} must be a string`);
      } else if (type === "number" && typeof value !== "number") {
        throw new ValidationError(`${field} must be a number`);
      } else if (type === "boolean" && typeof value !== "boolean") {
        throw new ValidationError(`${field} must be a boolean`);
      } else if (type === "array" && !Array.isArray(value)) {
        throw new ValidationError(`${field} must be an array`);
      }
    }
  }
}

// Define method handlers
const methodHandlers = {
  "social.spkeasy.graph.getTrusted": async (
    ctx: XRPCReqContext,
  ): Promise<HandlerOutput> => {
    const { did } = ctx.params as { did: string };
    // Validate input against lexicon
    validateAgainstLexicon(getTrustedDef, { did });

    try {
      const result = await trustService.getTrusted(did);
      return {
        encoding: "application/json",
        body: result,
      };
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new DatabaseError("Failed to get trusted users");
    }
  },
  "social.spkeasy.graph.addTrusted": async (
    ctx: XRPCReqContext,
  ): Promise<HandlerOutput> => {
    const { recipientDid } = ctx.params as { recipientDid: string };
    // Validate input against lexicon
    validateAgainstLexicon(addTrustedDef, { recipientDid });

    try {
      // Only the author can add trusted users
      authorize(ctx, "create", { authorDid: ctx.params.did });

      const result = await trustService.addTrusted(recipientDid);
      return {
        encoding: "application/json",
        body: { success: true },
      };
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new DatabaseError("Failed to add trusted user");
    }
  },
  "social.spkeasy.graph.removeTrusted": async (
    ctx: XRPCReqContext,
  ): Promise<HandlerOutput> => {
    const { recipientDid } = ctx.params as { recipientDid: string };
    // Validate input against lexicon
    validateAgainstLexicon(removeTrustedDef, { recipientDid });

    try {
      // Only the author can remove trusted users
      authorize(ctx, "delete", { authorDid: ctx.params.did });

      const result = await trustService.removeTrusted(recipientDid);
      return {
        encoding: "application/json",
        body: { success: true },
      };
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new DatabaseError("Failed to remove trusted user");
    }
  },
} as const;

type MethodName = keyof typeof methodHandlers;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, XRPCHandlerConfig> = {
  "social.spkeasy.graph.getTrusted": {
    handler: methodHandlers["social.spkeasy.graph.getTrusted"],
  },
  "social.spkeasy.graph.addTrusted": {
    handler: methodHandlers["social.spkeasy.graph.addTrusted"],
  },
  "social.spkeasy.graph.removeTrusted": {
    handler: methodHandlers["social.spkeasy.graph.removeTrusted"],
  },
};
