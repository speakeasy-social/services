import nock from "nock";
import { cache } from "@speakeasy-services/common";

/**
 * Mocks the Bluesky session validation API call for the enhanced JWT authentication.
 * This should be called in the beforeAll/beforeEach of your tests.
 *
 * @param options Configuration options for the mock
 * @param options.did The DID to return in the mock response
 * @param options.handle The handle to return in the mock response
 * @param options.host The host to mock (defaults to bsky.social)
 * @param options.status The HTTP status to return (defaults to 200)
 * @param options.error Whether to simulate an error response
 * @param options.malformedResponse Whether to return a malformed response (for testing error handling)
 * @param options.didMismatch Whether to return a different DID than expected (for testing validation)
 */
export function mockBlueskySession({
  did = "did:example:alex",
  handle = "alex.bsky.social",
  host = "https://bsky.social",
  status = 200,
  error = false,
  malformedResponse = false,
  didMismatch = false,
}: {
  did?: string;
  handle?: string;
  host?: string;
  status?: number;
  error?: boolean;
  malformedResponse?: boolean;
  didMismatch?: boolean;
} = {}) {
  // Clean up any existing mocks
  nock.cleanAll();

  if (error) {
    // Mock error response
    nock(host).get("/xrpc/com.atproto.server.getSession").reply(status);
  } else if (malformedResponse) {
    // Mock malformed response for testing error handling
    nock(host).get("/xrpc/com.atproto.server.getSession").reply(200, {
      // Missing required 'did' field or wrong type
      invalidField: "test",
      did: null, // Invalid DID
    });
  } else if (didMismatch) {
    // Mock response with different DID for testing validation
    nock(host).get("/xrpc/com.atproto.server.getSession").reply(200, {
      did: "did:example:different-user", // Different DID than what's in the JWT
      handle,
      email: "alex@example.com",
      accessJwt: "mock-access-token",
      refreshJwt: "mock-refresh-token",
    });
  } else {
    // Mock successful response
    nock(host).get("/xrpc/com.atproto.server.getSession").reply(status, {
      did,
      handle,
      email: "alex@example.com",
      accessJwt: "mock-access-token",
      refreshJwt: "mock-refresh-token",
    });
  }
}

/**
 * Mocks the Bluesky session validation API call for multiple users with different tokens.
 * This allows tests to authenticate different users based on their JWT tokens.
 *
 * @param options Configuration options for the mock
 * @param options.users Map of token to user data
 * @param options.host The host to mock (defaults to http://localhost:2583)
 */
export function mockMultiUserBlueskySession({
  users,
  host = "http://localhost:2583",
}: {
  users: Map<string, { did: string; handle: string; email?: string }>;
  host?: string;
}) {
  // Clean up any existing mocks
  nock.cleanAll();

  nock(host)
    .persist()
    .get('/xrpc/com.atproto.server.getSession')
    .reply(function(uri: string) {
      // Extract the Authorization header from the request
      const authHeader = this.req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');
      
      // Look up the user data for this token
      const userData = users.get(token || '');
      
      if (userData) {
        return [200, {
          did: userData.did,
          handle: userData.handle,
          email: userData.email || `${userData.handle.split('.')[0]}@example.com`,
          accessJwt: 'mock-access-token',
          refreshJwt: 'mock-refresh-token',
        }];
      } else {
        // Return 401 for unknown tokens
        return [401, { error: 'Invalid token' }];
      }
    });
}

/**
 * Convenience helper for the common two-user scenario (valid user + wrong user).
 * 
 * @param options Configuration options for the mock
 * @param options.validToken The token for the valid user
 * @param options.validUser User data for the valid user
 * @param options.wrongUserToken The token for the unauthorized user  
 * @param options.wrongUser User data for the unauthorized user
 * @param options.host The host to mock (defaults to http://localhost:2583)
 */
export function mockTwoUserBlueskySession({
  validToken,
  validUser,
  wrongUserToken,
  wrongUser,
  host = "http://localhost:2583",
}: {
  validToken: string;
  validUser: { did: string; handle: string; email?: string };
  wrongUserToken: string;
  wrongUser: { did: string; handle: string; email?: string };
  host?: string;
}) {
  mockMultiUserBlueskySession({
    users: new Map([
      [validToken, validUser],
      [wrongUserToken, wrongUser],
    ]),
    host,
  });
}

/**
 * Cleans up all nock mocks and clears the token cache.
 * This should be called in the afterAll/afterEach of your tests.
 */
export function cleanupBlueskySessionMocks() {
  nock.cleanAll();
  cache.flushAll();
}

/**
 * Verifies that all expected mocks were called.
 * This should be called in the afterAll/afterEach of your tests.
 */
export function verifyBlueskySessionMocks() {
  if (!nock.isDone()) {
    const pendingMocks = nock.pendingMocks();
    throw new Error(`Pending mocks found: ${pendingMocks.join(", ")}`);
  }
}
