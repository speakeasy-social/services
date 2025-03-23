import { XRPCError } from '@atproto/xrpc';
import { StatusCodes } from '../constants/index.js';
export { createLogger } from '../logger.js';

export function createError(
  status: number,
  message: string,
  error?: string
): XRPCError {
  return new XRPCError(status, message, error);
}

// Common application errors
export const Errors = {
  InvalidRequest: (message: string) =>
    createError(StatusCodes.BAD_REQUEST, message, 'InvalidRequest'),

  Unauthorized: (message: string = 'Unauthorized') =>
    createError(StatusCodes.UNAUTHORIZED, message, 'Unauthorized'),

  NotFound: (message: string) =>
    createError(StatusCodes.NOT_FOUND, message, 'NotFound'),

  RateLimitExceeded: (message: string = 'Too many requests') =>
    createError(StatusCodes.TOO_MANY_REQUESTS, message, 'RateLimitExceeded'),

  InternalServerError: (message: string = 'Internal server error') =>
    createError(StatusCodes.INTERNAL_SERVER, message, 'InternalError'),
} as const;
