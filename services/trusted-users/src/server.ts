import { Server } from '@speakeasy-services/service-base';
import config from './config.js';
import { methods } from './routes/trust.routes.js';
import {
  authorizationMiddleware,
  authenticateToken,
} from '@speakeasy-services/common';
import { lexicons } from './lexicon/index.js';
import { PrismaClient } from './generated/prisma-client/wasm.js';

const server = new Server({
  name: 'trusted-users',
  port: config.PORT,
  methods,
  middleware: [authenticateToken, authorizationMiddleware],
  lexicons,
  healthCheck: async () => {
    const prisma = new PrismaClient();
    // The table may be empty, that's fine, just as long as an
    // exception is not thrown
    await prisma.trustedUser.findFirst();
  },
});

export default server;
