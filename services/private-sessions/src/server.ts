import { Server, ServerOptions } from '@speakeasy-services/service-base';
import config from './config.js';
import { methods } from './routes/index.js';
import {
  authorizationMiddleware,
  authenticateToken,
  ExtendedRequest,
  getBearerToken,
  fetchFollowingDids,
} from '@speakeasy-services/common';
import { lexicons } from './lexicon/index.js';
import { healthCheck } from './health.js';
import {
  queryTrackerMiddleware,
  getTotalQueryDuration,
  getQueryDurationProfile,
  cleanupQueryTracking,
} from './db.js';
import NodeCache from 'node-cache';
import jsonwebtoken from 'jsonwebtoken';

// Cache following DIDs for 10 minutes
export const cache = new NodeCache({ stdTTL: 600 });

// Extend ServerOptions with our dbMetrics
type PrivateSessionsServerOptions = ServerOptions & {
  dbMetrics: {
    getTotalQueryDuration: typeof getTotalQueryDuration;
    getQueryDurationProfile: typeof getQueryDurationProfile;
    cleanupQueryTracking: typeof cleanupQueryTracking;
  };
};

/**
 * The two slowest requests in getting posts are authenticating the token
 * and fetching the user's follows.
 *
 * We can prefetch the user's follows and store them on the request object
 * so that we don't have to wait for them to be fetched.
 */
async function prefetchUserFollowing(
  req: ExtendedRequest,
  res: Response,
  next: () => void,
) {
  // Only prefetch for getPosts if they're filtering by follows
  if (
    req.params.method === 'social.spkeasy.privatePost.getPosts' &&
    req.query.filter === 'follows'
  ) {
    const token = getBearerToken(req);
    if (token.startsWith('api-key:')) return;
    const tokenContent = jsonwebtoken.decode(token);
    if (!tokenContent) return;

    if (!req.prefetch) req.prefetch = {};

    // Kick it off, but let token also resolve
    // while we wait for it

    const cachedFollowingDids = cache.get(tokenContent.sub as string);

    req.prefetch.followingDidsPromise =
      cachedFollowingDids ||
      fetchFollowingDids(req, token, tokenContent.sub as string).then(
        (followingDids) => {
          cache.set(tokenContent.sub as string, followingDids);
        },
      );
  }
  next();
}

const server = new Server({
  name: 'private-sessions',
  port: config.PORT,
  methods,
  middleware: [
    queryTrackerMiddleware,
    prefetchUserFollowing,
    authenticateToken,
    authorizationMiddleware,
  ],
  lexicons,
  healthCheck,
  dbMetrics: {
    getTotalQueryDuration,
    getQueryDurationProfile,
    cleanupQueryTracking,
  },
} as PrivateSessionsServerOptions);

export default server;