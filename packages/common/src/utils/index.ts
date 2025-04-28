import { XRPCError } from '@atproto/xrpc';
import { StatusCodes } from '../constants/index.js';
import NodeCache from 'node-cache';
import { getServiceApiKey } from '../auth/bearer-tokens.js';
import { ErrorWithDetails } from '../errors.js';
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
  bodyOrQuery: any,
): Promise<any> {
  const apiKey = getServiceApiKey(options.fromService);
  const host = {
    'private-sessions': process.env.PRIVATE_SESSIONS_HOST,
    'trusted-users': process.env.TRUSTED_USERS_HOST,
    'user-keys': process.env.USER_KEYS_HOST,
    'service-admin': process.env.SERVICE_ADMIN_HOST,
  }[options.toService];

  if (options.path.includes('?')) {
    // This could lead to personal data in the logs when errors occur
    throw new Error('Do not put query in path, put it in bodyOrQuery');
  }

  const baseUrl = `${host}/xrpc/${options.path}`;
  let url = baseUrl;
  let body;

  // if the method is GET, put the body in the query string
  if (options.method === 'GET') {
    const params = new URLSearchParams();
    Object.entries(bodyOrQuery).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => params.append(key, item));
      } else {
        params.append(key, String(value));
      }
    });
    const queryString = params.toString();
    url = `${url}?${queryString}`;
  } else {
    body = JSON.stringify(bodyOrQuery);
  }

  const response = await fetch(url, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  if (!response.ok) {
    const error = new ErrorWithDetails(
      'InternalAPIError',
      `Internal API Request Failed`,
      500,
      {
        url: baseUrl,
        status: response.status,
      },
    );
    throw error;
  }

  return response.json();
}
