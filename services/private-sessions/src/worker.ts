import { Worker } from '@speakeasy-services/service-base';
import { DatabaseError } from '@speakeasy-services/common';
import config from './config.js';

const worker = new Worker({
  name: 'private-sessions',
  queueConfig: {
    connectionString: config.DATABASE_URL,
    schema: config.PGBOSS_SCHEMA
  }
});

worker.start().catch((error: Error) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
