import { AuthenticationError } from '../errors.js';
import { asyncCache } from '../utils/index.js';
import { fetchBlueskySession } from '../bsky.js';

/**
 * Authenticates a user by verifying their Bluesky session token.
 * Uses caching to avoid repeated API calls for the same token.
 *
 * @param req - The Express request object
 * @param token - The Bluesky session token to verify
 * @throws AuthenticationError if the token is invalid or verification fails
 */
async function authenticateUser(req: any, token: string) {
  const startTime = Date.now();
  const session = await asyncCache(token, 300, fetchBlueskySession, [token]);
  const authDuration = Date.now() - startTime;

  // Attach user info to the request object for the authorization middleware
  req.user = {
    type: 'user',
    did: session.did,
    handle: session.handle,
    token: token,
    authDuration,
  };
}

/**
 * Authenticates a service using its API key.
 * API keys are expected to be in the format 'api-key:service-name:key'.
 *
 * @param req - The Express request object
 * @param token - The service API key to verify
 * @throws AuthenticationError if the API key is invalid or doesn't match the expected format
 */
function authenticateService(req: any, token: string) {
  const [_apiKey, serviceName] = token.split(':');

  // Get the expected full API key for the service
  const expectedKey = getServiceApiKey(serviceName);

  if (token !== expectedKey) {
    throw new AuthenticationError('Invalid service API key');
  }

  req.user = {
    type: 'service',
    name: serviceName,
  };
}

export function getBearerToken(req: any) {
  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing authorization header');
  }

  const [bearer, token] = authHeader.split(' ');

  if (bearer.toLowerCase() !== 'bearer') {
    throw new AuthenticationError('Invalid authorization header');
  }

  return token;
}

/**
 * Middleware that authenticates incoming requests as either a user or service.
 * For users, it verifies their Bluesky session token.
 * For services, it verifies their API key.
 *
 * @param req - The Express request object
 * @param res - The Express response object
 * @param next - The Express next function
 * @throws AuthenticationError if authentication fails
 */
export const authenticateToken = async (req: any, res: any, next: any) => {
  const token = getBearerToken(req);

  if (token.startsWith('api-key:')) {
    authenticateService(req, token);
  } else {
    await authenticateUser(req, token);
  }

  next();
};

/**
 * Optional authentication middleware - doesn't throw if no auth header present.
 * Useful for endpoints that can work with or without authentication.
 * If auth header is present, it will be validated; if invalid, it throws.
 * If no auth header, req.user will be undefined and request proceeds.
 */
export const optionalAuthenticateToken = async (
  req: any,
  res: any,
  next: any,
) => {
  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;

  // No auth header - proceed without authentication
  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  // Auth header present - validate it
  const token = getBearerToken(req);

  if (token.startsWith('api-key:')) {
    authenticateService(req, token);
  } else {
    await authenticateUser(req, token);
  }

  next();
};

/**
 * Generates a full API key for a given service.
 *
 * @param serviceName - The name of the service (e.g. "private-sessions", "trusted-users", "user-keys")
 * @returns The full API key in the format "api-key:service-name:key"
 * @throws AuthenticationError if the service name is unknown or the API key is not set
 */
export function getServiceApiKey(serviceName: string): string {
  const serviceKeys = {
    'private-sessions': process.env.PRIVATE_SESSIONS_API_KEY,
    'private-profiles': process.env.PRIVATE_PROFILES_API_KEY,
    'trusted-users': process.env.TRUSTED_USERS_API_KEY,
    'user-keys': process.env.USER_KEYS_API_KEY,
    media: process.env.MEDIA_API_KEY,
    'service-admin': process.env.SERVICE_ADMIN_API_KEY,
  };

  const key = serviceKeys[serviceName as keyof typeof serviceKeys];

  if (!key) {
    throw new AuthenticationError('Unknown service name');
  }

  return `api-key:${serviceName}:${key}`;
}
