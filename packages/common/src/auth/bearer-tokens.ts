import { AuthenticationError } from "../errors.js";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import { asyncCache } from "../utils/index.js";

interface BlueskySession {
  did: string;
  handle: string;
  email?: string;
  accessJwt: string;
  refreshJwt: string;
}

/**
 * Verifies a Bluesky session token by making a request to the Bluesky API.
 * In development mode, it will use a local Bluesky instance if the token's audience is 'did:web:localhost'.
 *
 * @param token - The JWT token to verify
 * @returns A Promise that resolves to a BlueskySession object containing the user's DID, handle, and tokens
 * @throws AuthenticationError if the token is invalid or the session verification fails
 */
async function verifyBlueskySession(token: string): Promise<BlueskySession> {
  let host = "https://bsky.social";

  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload;

    // Are we in development?
    if (
      ["test", "development"].includes(process.env.NODE_ENV || "") &&
      decoded?.aud === "did:web:localhost"
    ) {
      host = "http://localhost:2583";
    }
  } catch (error) {
    throw new AuthenticationError("Corrupt session token");
  }

  // Make request to Bluesky API
  const response = await fetch(`${host}/xrpc/com.atproto.server.getSession`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new AuthenticationError("Invalid session");
  }

  const session = (await response.json()) as BlueskySession;

  return session;
}

/**
 * Authenticates a user by verifying their Bluesky session token.
 * Uses caching to avoid repeated API calls for the same token.
 *
 * @param req - The Express request object
 * @param token - The Bluesky session token to verify
 * @throws AuthenticationError if the token is invalid or verification fails
 */
async function authenticateUser(req: any, token: string) {
  // Check cache first
  const session = await asyncCache(token, 300, verifyBlueskySession, [token]);

  // Attach user info to the request object for the authorization middleware
  req.user = {
    type: "user",
    did: session.did,
    handle: session.handle,
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
  // API keys are of the form api-key:service-name:key
  const serviceKeys = {
    "private-sessions": process.env.PRIVATE_SESSIONS_API_KEY,
    "trusted-users": process.env.TRUSTED_USERS_API_KEY,
    "user-keys": process.env.USER_KEYS_API_KEY,
  };

  const [_apiKey, serviceName, key] = token.split(":");

  const expectedKey = serviceKeys[serviceName as keyof typeof serviceKeys];

  if (!expectedKey) {
    throw new AuthenticationError("Unknown service name");
  }

  if (key !== expectedKey) {
    throw new AuthenticationError("Invalid service API key");
  }

  req.user = {
    type: "service",
    name: serviceName,
  };
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
  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthenticationError("Missing authorization header");
  }

  const [bearer, token] = authHeader.split(" ");

  if (bearer.toLowerCase() !== "bearer") {
    throw new AuthenticationError("Invalid authorization header");
  }

  if (token.startsWith("api-key:")) {
    authenticateService(req, token);
  } else {
    await authenticateUser(req, token);
  }

  next();
};
