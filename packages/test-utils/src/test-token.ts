import jwt from "jsonwebtoken";

/**
 * Generates a test JWT token for integration testing.
 * This token will be accepted by the authentication middleware in test mode.
 *
 * @param did - The DID of the user to authenticate as
 * @param handle - The handle of the user to authenticate as
 * @returns A JWT token that can be used for testing
 */
export function generateTestToken(did: string): string {
  const payload = {
    sub: did,
    aud: "did:web:localhost",
    iss: "did:web:localhost",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour from now
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
