import { Server } from '@speakeasy-services/service-base';
import { config } from './config.js';
import { registerRoutes } from './routes/index.js';
import logger from './utils/logger.js';

const server = new Server({
  name: 'user-keys',
  port: config.USER_KEYS_PORT,
  methods: {
    registerRoutes,
  },
});

server.start().catch((error: Error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});
