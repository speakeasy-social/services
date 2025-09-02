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
