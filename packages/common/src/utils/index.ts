import { XRPCError } from "@atproto/xrpc";
import { StatusCodes } from "../constants/index.js";
import NodeCache from "node-cache";
export { createLogger } from "../logger.js";

export const cache = new NodeCache({ stdTTL: 300 });
const promiseCache: Record<string, Promise<any>> = {};

export function createError(
  status: number,
  message: string,
  error?: string,
): XRPCError {
  return new XRPCError(status, message, error);
}

// Common application errors
export const Errors = {
  InvalidRequest: (message: string) =>
    createError(StatusCodes.BAD_REQUEST, message, "InvalidRequest"),

  Unauthorized: (message: string = "Unauthorized") =>
    createError(StatusCodes.UNAUTHORIZED, message, "Unauthorized"),

  NotFound: (message: string) =>
    createError(StatusCodes.NOT_FOUND, message, "NotFound"),

  RateLimitExceeded: (message: string = "Too many requests") =>
    createError(StatusCodes.TOO_MANY_REQUESTS, message, "RateLimitExceeded"),

  InternalServerError: (message: string = "Internal server error") =>
    createError(StatusCodes.INTERNAL_SERVER, message, "InternalError"),
} as const;

export async function asyncCache<T>(
  key: string,
  ttl: number,
  asyncFn: (...args: any[]) => Promise<T>,
  args: any[],
): Promise<T> {
  let result = cache.get<T>(key);
  if (!result) {
    let resultPromise = promiseCache[key];
    if (!resultPromise) {
      resultPromise = asyncFn(...args);
    }
    result = await resultPromise;
    cache.set(key, result);
    delete promiseCache[key];
  }
  return result as T;
}
