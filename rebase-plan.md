# Resolve Merge Conflict - Reconcile Both Approaches

## Goal

Combine both changes:
1. **From branch/stash**: Use `SessionJobHandlers` from `@speakeasy-services/session-management` for shared session handlers (DRY)
2. **From main**: Keep factory pattern for service-specific handlers (testability)

## Handler Categories

**Session handlers (shared via SessionJobHandlers)**:
- `ADD_RECIPIENT_TO_SESSION`
- `REVOKE_SESSION`
- `DELETE_SESSION_KEYS`
- `UPDATE_SESSION_KEYS`

**Service-specific handlers (factory pattern)**:
- `POPULATE_DID_CACHE`
- `NOTIFY_REACTION`
- `NOTIFY_REPLY`
- `DELETE_MEDIA`

## Changes Required

### 1. `services/private-sessions/src/worker.ts` - Resolve conflict

Combine both approaches:

```typescript
import { Worker } from '@speakeasy-services/service-base';
import { JOB_NAMES } from '@speakeasy-services/queue';
import { SessionJobHandlers } from '@speakeasy-services/session-management';
import { healthCheck } from './health.js';
import { getPrismaClient } from './db.js';
import {
  type PopulateDidCacheJob,
  type NotifyReactionJob,
  type NotifyReplyJob,
  type DeleteMediaJob,
  createPopulateDidCacheHandler,
  createNotifyReactionHandler,
  createNotifyReplyHandler,
  createDeleteMediaHandler,
} from './handlers/index.js';

const worker = new Worker({
  name: 'private-sessions-worker',
  healthCheck,
  port: 4001,
});

const prisma = getPrismaClient();

// Attach shared session management job handlers (DRY)
// Note: trusted-users publishes jobs with service-prefixed names
const sessionHandlers = new SessionJobHandlers(prisma as any, 'private-sessions', {
  usePrefixedJobNames: true,
});
sessionHandlers.attachToWorker(worker);

// Service-specific job handlers (testable factory pattern)
worker.queue.work<PopulateDidCacheJob>(
  JOB_NAMES.POPULATE_DID_CACHE,
  createPopulateDidCacheHandler(prisma),
);

worker.queue.work<NotifyReactionJob>(
  JOB_NAMES.NOTIFY_REACTION,
  createNotifyReactionHandler(prisma),
);

worker.queue.work<NotifyReplyJob>(
  JOB_NAMES.NOTIFY_REPLY,
  createNotifyReplyHandler(prisma),
);

worker.queue.work<DeleteMediaJob>(
  JOB_NAMES.DELETE_MEDIA,
  createDeleteMediaHandler(),
);

worker
  .start()
  .then(() => {
    console.log('Private sessions Worker started');
  })
  .catch((error: Error) => {
    console.error('Failed to start worker:', error);
    throw error;
  });
```

### 2. `services/private-sessions/src/handlers/index.ts` - Remove session handler exports

Only export service-specific handlers:

```typescript
export * from './types.js';
export { createPopulateDidCacheHandler } from './populateDidCache.js';
export { createNotifyReactionHandler } from './notifyReaction.js';
export { createNotifyReplyHandler } from './notifyReply.js';
export { createDeleteMediaHandler } from './deleteMedia.js';
```

### 3. `services/private-sessions/src/handlers/types.ts` - Remove session handler types

Keep only service-specific types (session types are in session-management package):

```typescript
export interface PopulateDidCacheJob {
  dids: string[];
  host: string;
}

export interface NotifyReactionJob {
  authorDid: string;
  uri: string;
}

export interface NotifyReplyJob {
  uri: string;
  token: string;
}

export interface DeleteMediaJob {
  key: string;
}
```

### 4. Delete duplicate session handler files

These are now handled by `SessionJobHandlers` in session-management:
- `services/private-sessions/src/handlers/addRecipientToSession.ts`
- `services/private-sessions/src/handlers/revokeSession.ts`
- `services/private-sessions/src/handlers/deleteSessionKeys.ts`
- `services/private-sessions/src/handlers/updateSessionKeys.ts`

### 5. Verify tests still work

The job handler tests test database operations, not the handler factories directly. They should continue to work since the underlying database logic is the same in `SessionJobHandlers`.

**Note: Implementation difference**
- `SessionJobHandlers` uses a 2-year lookback window for `addRecipientToSession` (when `currentSessionOnly: false`)
- Local handler factory used a 30-day window (incorrect)
- SessionJobHandlers is the single source of truth:
  - `private-sessions`: `currentSessionOnly: false` (default) = 2-year lookback for posts
  - `private-profiles`: `currentSessionOnly: true` = only most recent session for profiles

## Files to Modify

1. `services/private-sessions/src/worker.ts` - resolve conflict
2. `services/private-sessions/src/handlers/index.ts` - remove session exports
3. `services/private-sessions/src/handlers/types.ts` - remove session types

## Files to Delete

4. `services/private-sessions/src/handlers/addRecipientToSession.ts`
5. `services/private-sessions/src/handlers/revokeSession.ts`
6. `services/private-sessions/src/handlers/deleteSessionKeys.ts`
7. `services/private-sessions/src/handlers/updateSessionKeys.ts`
