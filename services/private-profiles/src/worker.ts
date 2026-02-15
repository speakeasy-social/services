import { Worker } from '@speakeasy-services/service-base';
import { healthCheck } from './health.js';

const worker = new Worker({
  name: 'private-profiles-worker',
  healthCheck,
  port: 4003,
});

// Note: Profile-specific background jobs can be added here as needed
// Currently no background jobs are required for profile management

worker
  .start()
  .then(() => {
    console.log('Private profiles Worker started');
  })
  .catch((error: Error) => {
    console.error('Failed to start worker:', error);
    throw error;
  });
