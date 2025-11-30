import jsonwebtoken from 'jsonwebtoken';

import { Server } from '@speakeasy-services/service-base';
import config from './config.js';
import { profileSessionMethods, profileMethods } from './routes/index.js';
import {
  authorizationMiddleware,
  authenticateToken,
  ExtendedRequest,
  getBearerToken,
  fetchFollowingDids,
} from '@speakeasy-services/common';
import { lexicons } from './lexicon/index.js';
import { Queue } from '@speakeasy-services/queue';
import { healthCheck } from './health.js';

import {
  queryTrackerMiddleware,
  getTotalQueryDuration,
  getQueryDurationProfile,
  cleanupQueryTracking,
} from './db.js';
import NodeCache from 'node-cache';

// Cache following DIDs for 10 minutes
export const cache = new NodeCache({ stdTTL: 600 });

// Custom type to extend ServerOptions with our dbMetrics
type PrivateSessionsServerOptions = {
  name: string;
  port: number;
  methods: Record<string, { handler: any }>;
  middleware?: any[];
  lexicons?: any[];
  healthCheck: () => Promise<void>;
  dbMetrics: {
    getTotalQueryDuration: typeof getTotalQueryDuration;
    getQueryDurationProfile: typeof getQueryDurationProfile;
    cleanupQueryTracking: typeof cleanupQueryTracking;
  };
};

const methods = {
  ...profileSessionMethods,
  ...profileMethods,
};

const server = new Server({
  name: 'private-profiles',
  port: config.PORT,
  methods,
  middleware: [
    queryTrackerMiddleware,
    prefetchUserFolling,
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

// Initialize and start the queue before starting the server
Queue.start()
  .then(() => {
    server.start();
  })
  .catch((error) => {
    console.error('Error starting queue', error);
    process.exit(1);
  });

/**
 * The two slowest requests in getting posts are authenticating the token
 * and fetching the user's follows.
 *
 * We can prefetch the user's follows and store them on the request object
 * so that we don't have to wait for them to be fetched.
 */
async function prefetchUserFolling(
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
