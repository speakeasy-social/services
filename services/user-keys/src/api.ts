import { Queue } from '@speakeasy-services/queue';
import server from './server.js';

// Initialize and start the queue before starting the server
Queue.start()
  .then(() => {
    server.start().catch((error: Error) => {
      console.error({ error }, 'Failed to start server');
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error('Error starting queue', error);
    process.exit(1);
  });
