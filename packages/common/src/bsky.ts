import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { AuthenticationError } from './errors.js';
import { ExtendedRequest } from './express-extensions.js';

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

export type BlueskyFetchOptions = {
  token?: string;
  host?: string;
  query?: Record<string, string | string[]>;
};

function getHostOrLocalhost(host: string, aud: string | string[] | undefined) {
  // Are we in development?
  if (
    ['test', 'development'].includes(process.env.NODE_ENV || '') &&
    aud === 'did:web:localhost'
  ) {
    return 'http://localhost:2583';
  }

  return host;
}

export function getHostFromToken(token: string) {
  let host = 'https://bsky.social';

  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload;

    host = getHostOrLocalhost(host, decoded?.aud);
  } catch (error) {
    throw new AuthenticationError('Corrupt session token');
  }

  return host;
}

export async function blueskyFetch(path: string, options: BlueskyFetchOptions) {
  let host = options.host;
  const token = options.token;

  // If we have a query, we need to add it to the path
  if (options.query) {
    const searchParams = new URLSearchParams();
    Object.entries(options.query).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, v));
      } else {
        searchParams.append(key, value);
      }
    });
    path += `?${searchParams.toString()}`;
  }

  if (!host && !token) {
    throw new Error('Either host or token must be provided');
  }

  if (!host) {
    host = getHostFromToken(token!);
  }

  const headers: { Authorization?: string } = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const uri = `${host}/xrpc/${path}`;

  // Make request to Bluesky API
  const response = await fetch(uri, {
    headers,
  });

  return await response.json();
}

/**
 * Verifies a session token by routing to the correct PDS based on the JWT audience.
 * Uses allowlist for trusted servers and domain verification for others.
 *
 * SECURITY NOTE — JWT routing before signature verification:
 * The JWT claims (aud, sub) are decoded without signature verification to determine which
 * PDS to route to. The token is then validated by calling getSession on that PDS.
 * Risk assessment: an attacker controlling their own PDS could only authenticate users
 * whose handles belong to their domain — they cannot impersonate users on trusted servers
 * (bsky.social, blacksky.app, bsky.network). The handle/domain match check for untrusted
 * servers provides meaningful protection. This trade-off was accepted to support multi-PDS
 * federation. See security review finding Z1.
 *
 * @param token - The JWT token to verify
 * @returns A Promise that resolves to a BlueskySession object containing the user's DID, handle, and tokens
 * @throws AuthenticationError if the token is invalid or the session verification fails
 */
export async function fetchBlueskySession(
  token: string,
): Promise<BlueskySession> {
  // Extract JWT claims
  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.decode(token) as jwt.JwtPayload;
    if (!decoded) {
      throw new AuthenticationError('Invalid JWT format');
    }
  } catch (error) {
    throw new AuthenticationError('Failed to decode JWT');
  }

  // Validate required JWT claims
  if (!decoded.aud || typeof decoded.aud !== 'string') {
    throw new AuthenticationError(
      'JWT missing or invalid audience (aud) claim',
    );
  }

  if (
    !decoded.sub ||
    typeof decoded.sub !== 'string' ||
    !decoded.sub.startsWith('did:')
  ) {
    throw new AuthenticationError(
      'JWT missing or invalid subject (sub) claim - must be a valid DID',
    );
  }

  // Extract host from aud (expect format: did:web:hostname)
  const audMatch = decoded.aud.match(/^did:web:(.+)$/);
  if (!audMatch) {
    throw new AuthenticationError('Unknown JWT audience, cannot authenticate');
  }

  const pdsHost = audMatch[1];
  const userDid = decoded.sub;

  // Check if this is a trusted server
  const trustedDomains = ['blacksky.app', 'bsky.social', 'bsky.network'];

  const isTrusted = trustedDomains.some(
    (domain) => pdsHost === domain || pdsHost.endsWith('.' + domain),
  );

  if (!isTrusted) {
    // For untrusted servers, verify the user's handle matches the PDS domain
    try {
      interface ProfileResponse {
        handle: string;
        did: string;
        [key: string]: unknown;
      }

      const profile = (await blueskyFetch('app.bsky.actor.getProfile', {
        token,
        query: { actor: userDid },
      })) as ProfileResponse;

      // Extract handle from alsoKnownAs field (format: at://handle)
      const userHandle = profile.handle;
      if (!userHandle) {
        throw new AuthenticationError(
          'User DID document missing handle information',
        );
      }

      let domainsMatch =
        userHandle.endsWith('.' + pdsHost) || userHandle === pdsHost;

      if (
        ['test', 'development'].includes(process.env.NODE_ENV || '') &&
        !domainsMatch
      ) {
        if (userHandle.endsWith('.test') && pdsHost === 'localhost') {
          domainsMatch = true;
        }
      }

      // Verify handle is subdomain of PDS domain
      if (!domainsMatch) {
        throw new AuthenticationError(
          `User handle domain ${userHandle} does not match PDS domain ${pdsHost}`,
        );
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(
        `Failed to verify user domain: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // Now validate the token with the PDS from the token aud
  const response = await blueskyFetch('com.atproto.server.getSession', {
    token,
    host: getHostOrLocalhost(`https://${pdsHost}`, decoded.aud),
  });

  // If PDS returned an error, throw it
  if (response && typeof response === 'object' && 'error' in response) {
    throw new AuthenticationError(
      `PDS session verification failed: ${JSON.stringify(response)}`,
    );
  }

  // For successful responses, ensure accessJwt is set
  return {
    ...(response as BlueskySession),
    accessJwt: token,
  } as BlueskySession;
}

export async function fetchBlueskyProfile(
  did: string,
  options: BlueskyFetchOptions,
): Promise<{ handle: string; did: string }> {
  return blueskyFetch(
    `app.bsky.actor.getProfile?actor=${did}`,
    options,
  ) as Promise<{ handle: string; did: string }>;
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
  token: string,
  recipientDid: string,
) {
  if (!token) {
    throw new AuthenticationError('User not authenticated');
  }

  const host = getHostFromToken(token);
  const allFollowDids: string[] = [recipientDid];
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
            {
              status: response.status,
            },
            'Getting follows: Rate limit or server error while fetching follows',
          );
          return allFollowDids;
        }
        throw new Error(`Failed to fetch follows: ${response.statusText}`);
      }

      const data = (await response.json()) as BlueskyFollows;
      const followDids = data.follows.map(
        (follow: { did: string }) => follow.did,
      );
      allFollowDids.push(...followDids);
      cursor = data.cursor;
    } while (cursor);

    return allFollowDids;
  } catch (error) {
    // If we encounter any error, return what we have so far
    return allFollowDids;
  }
}

export interface PostView {
  uri: string;
  cid: string;
  author: Record<string, unknown>;
  record: {
    $type: string;
    text: string;
    createdAt: string;
    langs: string[];
    facets: Array<Record<string, unknown>>;
    embed: {
      $type: string;
      record: {
        cid: string;
        uri: string;
      };
    };
    reply?: {
      root: {
        uri: string;
        cid: string;
      };
      parent: {
        uri: string;
        cid: string;
      };
    };
  };
  embed?: Record<string, unknown>;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  quoteCount?: number;
  indexedAt: string;
  viewer?: Record<string, unknown>;
  labels?: Array<Record<string, unknown>>;
  threadgate?: Record<string, unknown>;
  [k: string]: unknown;
}

/**
 * Fetches posts from the Bluesky API using their URIs.
 *
 * @param uris - Array of post URIs to fetch
 * @param token - Authentication token for the Bluesky API
 * @returns Promise that resolves to an array of post objects
 */
export async function fetchBlueskyPosts(
  uris: string[],
  token: string,
): Promise<PostView[]> {
  interface GetPostsResponse {
    posts: PostView[];
  }

  const response = (await blueskyFetch('app.bsky.feed.getPosts', {
    token,
    query: {
      uris,
    },
  })) as GetPostsResponse;

  return response.posts;
}
