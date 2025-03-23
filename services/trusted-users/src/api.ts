import { Server } from '@speakeasy-services/service-base';
import { config } from './config.js';
import { registerRoutes } from './routes/index.js';

const server = new Server({
  name: 'trusted-users',
  port: config.TRUSTED_USERS_PORT,
  methods: {
    registerRoutes,
  },
});

server.start();
