import { Server } from '@speakeasy-services/service-base';
import config from './config.js';
import { methods } from './routes/index.js';
import {
  authorizationMiddleware,
  authenticateToken,
} from '@speakeasy-services/common';
import { lexicons } from './lexicon/index.js';
import { PrismaClient } from './generated/prisma-client/index.js';

const server = new Server({
  name: 'service-admin',
  port: config.PORT,
  methods,
  middleware: [authenticateToken, authorizationMiddleware],
  lexicons,
  healthCheck: async () => {
    const prisma = new PrismaClient();
    // The table may be empty, that's fine, just as long as an
    // exception is not thrown
    await prisma.userFeature.findFirst();
  },
});

export default server;
