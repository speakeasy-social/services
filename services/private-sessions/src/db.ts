import { Prisma, PrismaClient } from './generated/prisma-client/index.js';

const options: Prisma.PrismaClientOptions = {};

options.log = [
  {
    emit: 'event',
    level: 'query',
  },
];

const prisma = new PrismaClient(options);

// Request-specific query duration tracking
const requestDurations = new Map<string, number>();

(prisma.$on as any)('query', (e: Prisma.QueryEvent) => {
  if (process.env.PRISMA_LOG) {
    console.log('Query Event Fired:', e.query);
    console.log('Query Duration:', e.duration + 'ms');
  }

  // Get the current request ID from the active requests set
  const requestId = globalRequestId.get();

  if (requestId) {
    const currentDuration = requestDurations.get(requestId) || 0;
    requestDurations.set(requestId, currentDuration + e.duration);
  }
});

// Global request ID tracking
class RequestIdHolder {
  private requestIds = new Map<number, string>();

  set(requestId: string): void {
    // Store requestId with the current thread ID (approximated by the current tick)
    this.requestIds.set(Date.now(), requestId);
  }

  get(): string | undefined {
    // Return the most recently set requestId
    // This is an approximation and won't work perfectly for concurrent requests
    if (this.requestIds.size === 0) return undefined;

    // Get the latest entry
    const latestKey = Math.max(...Array.from(this.requestIds.keys()));
    return this.requestIds.get(latestKey);
  }

  clear(requestId: string): void {
    // Remove this specific requestId
    for (const [key, value] of this.requestIds.entries()) {
      if (value === requestId) {
        this.requestIds.delete(key);
      }
    }

    // Also clean up the duration
    requestDurations.delete(requestId);
  }
}

const globalRequestId = new RequestIdHolder();

export function getPrismaClient() {
  return prisma;
}

// Get the total query duration for a specific request
export function getTotalQueryDuration(requestId: string): number {
  const duration = requestDurations.get(requestId) || 0;
  return duration;
}

// Clean up query tracking resources for a request
export function cleanupQueryTracking(requestId: string): void {
  requestDurations.delete(requestId);
  globalRequestId.clear(requestId);
  console.log(`Cleared request ID: ${requestId}`);
}

// Middleware to initialize query duration tracking for a request
export function queryTrackerMiddleware(req: any, res: any, next: () => void) {
  // Generate a unique request ID if not already present
  const requestId =
    req.headers['x-request-id'] ||
    `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = requestId;
  }

  // Initialize tracking for this request
  requestDurations.set(requestId, 0);
  globalRequestId.set(requestId);

  // Clean up when the response is finished
  res.on('finish', () => {
    cleanupQueryTracking(requestId);
  });

  // Store the functions on res.locals
  if (res.locals) {
    res.locals.getTotalQueryDuration = () => getTotalQueryDuration(requestId);
    res.locals.cleanupQueryTracking = () => cleanupQueryTracking(requestId);
  }

  // Add to middleware scope for direct access
  req.getTotalQueryDuration = () => getTotalQueryDuration(requestId);
  req.cleanupQueryTracking = () => cleanupQueryTracking(requestId);

  next();
}
