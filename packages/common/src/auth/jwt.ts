import { AuthVerifier, AuthVerifierContext, AuthOutput } from '@atproto/xrpc-server';
import { AuthenticationError } from '../errors.js';
import NodeCache from 'node-cache';
import fetch from 'node-fetch';

// Cache session responses for 5 minutes
const sessionCache = new NodeCache({ stdTTL: 300 });

interface BlueskySession {
  did: string;
  handle: string;
  email?: string;
  accessJwt: string;
  refreshJwt: string;
}

async function verifyBlueskySession(token: string): Promise<BlueskySession> {
  // Check cache first
  const cachedSession = sessionCache.get<BlueskySession>(token);
  if (cachedSession) {
    return cachedSession;
  }

  // Make request to Bluesky API
  const response = await fetch('https://bsky.social/xrpc/com.atproto.server.getSession', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new AuthenticationError('Invalid or expired session');
  }

  const session = await response.json() as BlueskySession;

  // Cache the session
  sessionCache.set(token, session);

  return session;
}

export const verifyAuth: AuthVerifier = async (ctx: AuthVerifierContext): Promise<AuthOutput> => {
  const authHeader = ctx.req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or invalid authorization header');
  }

  const token = authHeader.split(' ')[1];
  try {
    // TODO Check if it's bluesky or one of our own services

    const session = await verifyBlueskySession(token);

    // Attach user info to the request object for the authorization middleware
    ctx.req.user = {
      did: session.did,
      handle: session.handle
    };

    return {
      credentials: {
        did: session.did,
        handle: session.handle
      }
    };
  } catch (error) {
    throw new AuthenticationError('Invalid Bluesky session');
  }
};
