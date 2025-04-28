import { XRPCError } from '@atproto/xrpc';
import { StatusCodes } from '../constants/index.js';
import NodeCache from 'node-cache';
import { getServiceApiKey } from '../auth/bearer-tokens.js';
import { ServiceError } from '../errors.js';
export { createLogger } from '../logger.js';
export * from './view.js';

export const cache = new NodeCache({ stdTTL: 300 });
const promiseCache: Record<string, Promise<any>> = {};

/**
 * Creates an XRPC error response
 */
export function createError(
  status: number,
  message: string,
  error?: string,
): XRPCError {
  return new XRPCError(status, message, error);
}

/**
 * Common error responses for the application
 */
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

/**
 * Caches async function results with TTL
 */
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

/**
 * Makes an HTTP request to another Speakeasy service
 */
export async function speakeasyApiRequest(
  options: {
    method: string;
    path: string;
    fromService: string;
    toService: string;
  },
  body: any,
): Promise<any> {
  const apiKey = getServiceApiKey(options.fromService);
  const host = {
    'private-sessions': process.env.PRIVATE_SESSIONS_HOST,
    'trusted-users': process.env.TRUSTED_USERS_HOST,
    'user-keys': process.env.USER_KEYS_HOST,
    'service-admin': process.env.SERVICE_ADMIN_HOST,
  }[options.toService];

  const url = `${host}/xrpc/${options.path}`;
  const response = await fetch(url, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ServiceError(
      `Failed to add recipient to session: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  return response.json();
}
