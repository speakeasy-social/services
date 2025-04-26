import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { AuthenticationError } from './errors.js';
import { ExtendedRequest, User } from './express-extensions.js';

export interface BlueskySession {
  did: string;
  handle: string;
  email?: string;
  accessJwt: string;
  refreshJwt: string;
}

export interface BlueskyFollows {
  cursor: string;
  follows: {
    did: string;
  }[];
}

function getHostFromToken(token: string) {
  let host = 'https://bsky.social';

  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload;

    // Are we in development?
    if (
      ['test', 'development'].includes(process.env.NODE_ENV || '') &&
      decoded?.aud === 'did:web:localhost'
    ) {
      host = 'http://localhost:2583';
    }
  } catch (error) {
    throw new AuthenticationError('Corrupt session token');
  }

  return host;
}
/**
 * Verifies a Bluesky session token by making a request to the Bluesky API.
 * In development mode, it will use a local Bluesky instance if the token's audience is 'did:web:localhost'.
 *
 * @param token - The JWT token to verify
 * @returns A Promise that resolves to a BlueskySession object containing the user's DID, handle, and tokens
 * @throws AuthenticationError if the token is invalid or the session verification fails
 */
export async function fetchBlueskySession(
  token: string,
): Promise<BlueskySession> {
  const host = getHostFromToken(token);

  // Make request to Bluesky API
  const response = await fetch(`${host}/xrpc/com.atproto.server.getSession`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const session = (await response.json()) as BlueskySession;

  return session;
}

/**
 * Fetches all DIDs that a user is following from the Bluesky API.
 * Handles pagination automatically and returns partial results if rate limited or encountering server errors.
 *
 * @param recipientDid - The DID of the user whose follows we want to fetch
 * @param req - The extended request object containing user authentication
 * @returns A promise that resolves to an array of DIDs that the user is following
 * @throws AuthenticationError if the user is not authenticated
 */
export async function fetchFollowingDids(
  req: ExtendedRequest,
  recipientDid: string,
) {
  const token = (req.user as User).token;
  if (!token) {
    throw new AuthenticationError('User not authenticated');
  }

  const host = getHostFromToken(token);
  const allFollowDids: string[] = [req.user?.did!];
  let cursor: string | undefined;

  try {
    do {
      const query = new URLSearchParams({
        actor: recipientDid,
        limit: '100',
      });

      if (cursor) {
        query.append('cursor', cursor);
      }

      const response = await fetch(
        `${host}/xrpc/app.bsky.graph.getFollows?${query.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      // If we hit a rate limit or network error, return what we have so far
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          req.logger.warn(
            'Getting follows: Rate limit or server error while fetching follows',
            {
              status: response.status,
            },
          );
          return allFollowDids;
        }
        throw new Error(`Failed to fetch follows: ${response.statusText}`);
      }

      const data = (await response.json()) as BlueskyFollows;
      const followDids = data.follows.map((follow: any) => follow.did);
      allFollowDids.push(...followDids);
      cursor = data.cursor;
    } while (cursor);

    return allFollowDids;
  } catch (error) {
    // If we encounter any error, return what we have so far
    return allFollowDids;
  }
}
