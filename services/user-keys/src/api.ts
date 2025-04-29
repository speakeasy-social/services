import { Server } from '@speakeasy-services/service-base';
import config from './config.js';
import { methods } from './routes/key.routes.js';
import {
  authorizationMiddleware,
  authenticateToken,
} from '@speakeasy-services/common';
import { lexicons } from './lexicon/index.js';
import { Queue } from '@speakeasy-services/queue';
import { PrismaClient } from './generated/prisma-client/index.js';

const server = new Server({
  name: 'user-keys',
  port: config.PORT,
  methods,
  middleware: [authenticateToken, authorizationMiddleware],
  lexicons,
  healthCheck: async () => {
    const prisma = new PrismaClient();
    // The table may be empty, that's fine, just as long as an
    // exception is not thrown
    await prisma.userKey.findFirst();
  },
});

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
