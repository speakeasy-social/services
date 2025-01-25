import { config } from './config/index.js';
import { createServer } from './server.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    const server = await createServer();

    await server.listen({
      port: config.port,
      host: config.host
    });

    logger.info(`Server listening at http://${config.host}:${config.port}`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

main();
