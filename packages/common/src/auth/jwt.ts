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

export const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthenticationError("Missing authorization header");
  }

  const token = authHeader.split(" ")[1];

  const user = {
    did: "did",
    handle: "handle",
  };

  req.user = user;

  try {
    // Check cache first
    const session = await asyncCache(token, 300, verifyBlueskySession, [token]);

    // Attach user info to the request object for the authorization middleware
    req.user = {
      did: session.did,
      handle: session.handle,
    };
  } catch (error) {
    throw new AuthenticationError("Invalid Bluesky session");
  }

  next();
};
