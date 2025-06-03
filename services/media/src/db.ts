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
// Track individual query durations for each request
const requestQueryDurations = new Map<string, number[]>();

(prisma.$on as any)('query', (e: Prisma.QueryEvent) => {
  if (process.env.PRISMA_LOG) {
    console.log('Query Event Fired:', e.query);
    console.log('Query Duration:', e.duration + 'ms');
  }

  // Get the current request ID from the active requests set
  const requestId = globalRequestId.get();

  if (requestId) {
    // Update total duration
    const currentDuration = requestDurations.get(requestId) || 0;
    requestDurations.set(requestId, currentDuration + e.duration);

    // Store individual query duration
    const durations = requestQueryDurations.get(requestId) || [];
    durations.push(e.duration);
    requestQueryDurations.set(requestId, durations);
  }
});

// Global request ID tracking
class RequestIdHolder {
  private requestIds = new Map<number, string>();

  set(requestId: string): void {
    this.requestIds.set(Date.now(), requestId);
  }

  get(): string | undefined {
    if (this.requestIds.size === 0) return undefined;
    const latestKey = Math.max(...Array.from(this.requestIds.keys()));
    return this.requestIds.get(latestKey);
  }

  clear(requestId: string): void {
    for (const [key, value] of this.requestIds.entries()) {
      if (value === requestId) {
        this.requestIds.delete(key);
      }
    }
    requestDurations.delete(requestId);
    requestQueryDurations.delete(requestId);
  }
}

const globalRequestId = new RequestIdHolder();

export function getPrismaClient() {
  return prisma;
}

export function getTotalQueryDuration(requestId: string): number {
  return requestDurations.get(requestId) || 0;
}

export function getQueryDurationProfile(requestId: string): string {
  const durations = requestQueryDurations.get(requestId) || [];
  return durations.join(',');
}

export function cleanupQueryTracking(requestId: string): void {
  requestDurations.delete(requestId);
  requestQueryDurations.delete(requestId);
  globalRequestId.clear(requestId);
}

export function queryTrackerMiddleware(req: any, res: any, next: () => void) {
  const requestId =
    req.headers['x-request-id'] ||
    `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = requestId;
  }

  requestDurations.set(requestId, 0);
  requestQueryDurations.set(requestId, []);
  globalRequestId.set(requestId);

  res.on('finish', () => {
    cleanupQueryTracking(requestId);
  });

  if (res.locals) {
    res.locals.getTotalQueryDuration = () => getTotalQueryDuration(requestId);
    res.locals.getQueryDurationProfile = () =>
      getQueryDurationProfile(requestId);
    res.locals.cleanupQueryTracking = () => cleanupQueryTracking(requestId);
  }

  req.getTotalQueryDuration = () => getTotalQueryDuration(requestId);
  req.getQueryDurationProfile = () => getQueryDurationProfile(requestId);
  req.cleanupQueryTracking = () => cleanupQueryTracking(requestId);

  next();
}
