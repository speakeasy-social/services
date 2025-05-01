import express from 'express';
import { Express, Request, Response, NextFunction } from 'express';
import { validateEnv, baseSchema } from './config.js';
import { LexiconDoc } from '@atproto/lexicon';
import z from 'zod';
import {
  createLogger,
  errorHandler,
  ExtendedRequest,
  NotFoundError,
  RequestHandler,
} from '@speakeasy-services/common';
import { logAttributes } from '@speakeasy-services/common';
import { healthCheckAPI } from './health.js';
import 'express-async-errors';

// Extend Express Request type to include logger
declare global {
  namespace Express {
    interface Request {
      logger: ReturnType<typeof createLogger>;
      user?: {
        type: string;
        did?: string;
        name?: string;
      };
    }
  }
}

export interface ServerOptions {
  name: string;
  port: number;
  methods: Record<
    string,
    {
      handler: RequestHandler;
    }
  >;
  middleware?: any[];
  onShutdown?: () => Promise<void>;
  lexicons?: LexiconDoc[];
  healthCheck: () => Promise<void>;
}

export class Server {
  express: Express;
  private config: ReturnType<typeof validateEnv<typeof baseSchema>>;
  private options: ServerOptions;
  private logger: ReturnType<typeof createLogger>;

  constructor(options: ServerOptions) {
    this.options = options;
    this.config = validateEnv(z.object(baseSchema));
    this.logger = createLogger({
      serviceName: options.name,
      level: this.config.LOG_LEVEL,
    });
    this.express = this.createServer();
  }

  private createServer(): Express {
    const app = express();

    // Enable CORS for Bluesky client
    app.use((req, res, next) => {
      const allowedOrigins = [
        'https://spkeasy.social',
        'https://magetic.spkeasy.social',
        'http://localhost:19006',
      ];

      const origin = req.headers.origin || '';
      const allowedOrigin = allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0];
      res.header('Access-Control-Allow-Origin', allowedOrigin);

      res.header(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS',
      );
      res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization',
      );

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }

      next();
    });

    app.get('/health', healthCheckAPI(this.options.healthCheck, this.logger));

    // Add logger to the request for easy access
    app.use((req, res, next) => {
      req.logger = this.logger.child({
        requestId: (req.headers['x-request-id'] as string) || 'unknown',
        method: req.method,
        path: req.path,
      });
      next();
    });

    // Mount XRPC routes
    app.all(
      '/xrpc/:method',
      // Add middleware
      ...(this.options.middleware || []),
      // Parse JSON bodies
      express.json(),

      async (request: Request, res: Response, next: NextFunction) => {
        const req = request as ExtendedRequest;
        req.startTime = Date.now();
        const method = req.params.method;

        try {
          // Get the method handler
          const methodHandler = this.options.methods[method];
          if (!methodHandler) {
            throw new NotFoundError('Method not found');
          }

          // Call the method handler directly
          const output = await methodHandler.handler(req, res);
          if (!output || !('body' in output)) {
            throw new Error('Invalid handler output');
          }

          // Send the JSON response
          res.status(200).json(output.body);

          req.logger.info(await logAttributes(req, 200));
        } catch (error) {
          next(error);
        }
      },
    );

    // Catch-all route handler for unmatched routes
    app.use('*', () => {
      throw new NotFoundError('Not Found');
    });

    // Add error handling middleware
    app.use(errorHandler);

    return app;
  }

  public async start() {
    try {
      this.express.listen(this.options.port, '0.0.0.0', () => {
        this.logger.info(
          `🚀 ${this.options.name} service running on port ${this.options.port}`,
        );
      });
    } catch (err) {
      this.logger.error({ error: err }, 'Error starting server');
      process.exit(1);
    }

    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  private async shutdown() {
    this.logger.info('Shutting down server...');
    try {
      if (this.options.onShutdown) {
        await this.options.onShutdown();
      }
      process.exit(0);
    } catch (err) {
      this.logger.error({ error: err }, 'Error during shutdown');
      process.exit(1);
    }
  }
}
