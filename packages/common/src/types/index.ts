import { XRPCError } from '@atproto/xrpc';

export type { XRPCError };

// Extended error types specific to our application
export type SpeakeasyError = XRPCError & {
  name: string;
  cause?: Error;
};

// Common types will be exported from here
export type ErrorResponse = {
  error: string;
  code: string;
  details?: Record<string, unknown>;
};
