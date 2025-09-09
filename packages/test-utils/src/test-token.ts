import jwt from "jsonwebtoken";

/**
 * Generates a test JWT token for integration testing.
 * This token will be accepted by the authentication middleware in test mode.
 *
 * @param did - The DID of the user to authenticate as
 * @param options - Additional token options
 * @param options.handle - The handle of the user to authenticate as
 * @param options.pdsUrl - The PDS URL to use as issuer (defaults to https://bsky.social for tests)
 * @param options.expired - Whether to generate an expired token
 * @returns A JWT token that can be used for testing
 */
export function generateTestToken(
  did: string, 
  options: {
    handle?: string;
    pdsUrl?: string;
    expired?: boolean;
  } = {}
): string {
  // Default handle to .test domain for localhost testing compatibility
  const { handle = 'test-user.test', pdsUrl = 'https://bsky.social', expired = false } = options;
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: did,
    aud: "did:web:localhost",
    iss: pdsUrl, // This is what the enhanced validation will use to determine which PDS to call
    iat: now,
    exp: expired ? now - 3600 : now + 3600, // 1 hour ago if expired, 1 hour from now if not
    handle, // Include handle in token for more realistic testing
  };

  // In test mode, we don't need a real secret since we're not verifying signatures
  const token = jwt.sign(payload, "test-secret", { algorithm: "HS256" });
  return token;
}

/**
 * Generates a test service token for integration testing.
 * This token will be accepted by the authentication middleware in test mode.
 *
 * @param serviceName - The name of the service to authenticate as
 * @returns A service token that can be used for testing
 */
export function generateTestServiceToken(serviceName: string): string {
  const serviceKeys = {
    "private-sessions": "red",
    "trusted-users": "yellow",
    "user-keys": "green",
  };

  const key = serviceKeys[serviceName as keyof typeof serviceKeys];
  if (!key) {
    throw new Error(`Unknown service name: ${serviceName}`);
  }

  return `api-key:${serviceName}:${key}`;
}
