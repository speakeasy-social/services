import nock from 'nock';
import { LexiconDoc } from '@atproto/lexicon';
import {
  validateLexiconInput,
  validateLexiconOutput,
} from '@speakeasy-services/common';

type ServiceName =
  | 'private-sessions'
  | 'trusted-users'
  | 'user-keys'
  | 'service-admin'
  | 'media';

interface MockOptions {
  method: 'GET' | 'POST';
  path: string;
  toService: ServiceName;
  response: unknown;
  statusCode?: number;
  lexicon?: LexiconDoc;
}

// Service hosts - matches the service host env vars
const SERVICE_HOSTS: Record<ServiceName, string> = {
  'private-sessions':
    process.env.PRIVATE_SESSIONS_HOST || 'http://localhost:3001',
  'trusted-users': process.env.TRUSTED_USERS_HOST || 'http://localhost:3002',
  'user-keys': process.env.USER_KEYS_HOST || 'http://localhost:3003',
  'service-admin': process.env.SERVICE_ADMIN_HOST || 'http://localhost:3004',
  media: process.env.MEDIA_HOST || 'http://localhost:3005',
};

// Lazy-loaded lexicon registry to avoid circular deps
const lexiconRegistry: Map<string, LexiconDoc> = new Map();
let lexiconsLoaded = false;

/**
 * Lazy-load lexicons from all services
 */
async function loadLexicons(): Promise<void> {
  if (lexiconsLoaded) return;

  const services = [
    { name: 'trusted-users', path: '@speakeasy-services/trusted-users' },
    { name: 'user-keys', path: '@speakeasy-services/user-keys' },
    { name: 'private-sessions', path: '@speakeasy-services/private-sessions' },
    { name: 'media', path: '@speakeasy-services/media' },
    { name: 'service-admin', path: '@speakeasy-services/service-admin' },
  ];

  for (const service of services) {
    try {
      // Dynamic import with error handling
      const module = await import(`${service.path}/lexicon`);
      const lexicons: LexiconDoc[] = module.lexicons || [];
      for (const lexicon of lexicons) {
        lexiconRegistry.set(lexicon.id, lexicon);
      }
    } catch {
      // Service may not export lexicons, that's OK
    }
  }

  lexiconsLoaded = true;
}

/**
 * Find a lexicon by path (NSID)
 */
function findLexicon(path: string): LexiconDoc | undefined {
  return lexiconRegistry.get(path);
}

/**
 * Mock an inter-service API call with optional lexicon validation
 *
 * Validates:
 * - Response shape at setup time (fail fast if response doesn't match lexicon output)
 * - Request shape at call time (fail if request doesn't match lexicon input)
 */
export function mockInterServiceCall(options: MockOptions): nock.Scope {
  const {
    method,
    path,
    toService,
    response,
    statusCode = 200,
    lexicon: providedLexicon,
  } = options;

  const host = SERVICE_HOSTS[toService];

  // Find lexicon - use provided one or look up by path
  const lexicon = providedLexicon || findLexicon(path);

  // Validate response at setup time (fail fast)
  if (lexicon && statusCode >= 200 && statusCode < 300) {
    try {
      validateLexiconOutput(lexicon, response);
    } catch (error) {
      throw new Error(
        `Mock setup failed: Response doesn't match lexicon output schema for ${path}. ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const xrpcPath = `/xrpc/${path}`;

  const scope = nock(host).persist();

  if (method === 'GET') {
    // Use a regex that matches the path with any query string
    const pathRegex = new RegExp(`^${xrpcPath.replace(/\./g, '\\.')}(\\?.*)?$`);
    scope.get(pathRegex).reply(function (uri) {
      // Validate request at call time
      if (lexicon) {
        const url = new URL(uri, host);
        const params: Record<string, string | string[]> = {};
        url.searchParams.forEach((value, key) => {
          const existing = params[key];
          if (existing) {
            params[key] = Array.isArray(existing)
              ? [...existing, value]
              : [existing, value];
          } else {
            params[key] = value;
          }
        });

        try {
          validateLexiconInput(lexicon, params);
        } catch (error) {
          return [
            400,
            {
              error: 'InvalidRequest',
              message: `Request validation failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ];
        }
      }

      return [statusCode, response];
    });
  } else {
    scope.post(xrpcPath).reply(function (uri, requestBody) {
      // Validate request at call time
      if (lexicon) {
        try {
          validateLexiconInput(lexicon, requestBody);
        } catch (error) {
          return [
            400,
            {
              error: 'InvalidRequest',
              message: `Request validation failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ];
        }
      }

      return [statusCode, response];
    });
  }

  return scope;
}

/**
 * Clean up all nock interceptors
 */
export function cleanupInterServiceMocks(): void {
  nock.cleanAll();
}

/**
 * Disable real HTTP requests (enables nock mocking)
 */
export function disableNetConnect(): void {
  nock.disableNetConnect();
  // Allow localhost for database connections, etc.
  nock.enableNetConnect((host) => {
    return (
      host.includes('127.0.0.1') ||
      host.includes('localhost') ||
      host.includes('postgres')
    );
  });
}

/**
 * Re-enable real HTTP requests
 */
export function enableNetConnect(): void {
  nock.enableNetConnect();
}

/**
 * Check if all mocks have been called
 */
export function pendingMocks(): string[] {
  return nock.pendingMocks();
}

/**
 * Assert all mocks were called
 */
export function assertAllMocksCalled(): void {
  const pending = pendingMocks();
  if (pending.length > 0) {
    throw new Error(
      `Expected all mocks to be called. Pending: ${pending.join(', ')}`,
    );
  }
}

/**
 * Initialize the mock system - loads lexicons
 */
export async function initInterServiceMocks(): Promise<void> {
  await loadLexicons();
}

/**
 * Register a lexicon manually (useful for tests)
 */
export function registerLexicon(lexicon: LexiconDoc): void {
  lexiconRegistry.set(lexicon.id, lexicon);
}

// Re-export nock for advanced usage
export { nock };
