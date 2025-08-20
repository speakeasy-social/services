import server from './server.js';
import { Queue } from '@speakeasy-services/queue';

// Initialize and start the queue before starting the server
Queue.start()
  .then(() => {
    server.start();
  })
  .catch((error) => {
    console.error('Error starting queue', error);
    process.exit(1);
  });
