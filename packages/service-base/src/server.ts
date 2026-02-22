import express from 'express';
import { Express, Request, Response, NextFunction } from 'express';
import { Server as HTTPServer } from 'http';
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
  dbMetrics?: {
    getTotalQueryDuration: (requestId: string) => number;
    getQueryDurationProfile?: (requestId: string) => string;
    cleanupQueryTracking: (requestId: string) => void;
  };
}

export class Server {
  express: Express;
  private config: ReturnType<typeof validateEnv<typeof baseSchema>>;
  private options: ServerOptions;
  private logger: ReturnType<typeof createLogger>;
  private httpServer?: HTTPServer;
  private signalHandlersRegistered = false;

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
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-speakeasy-session-id',
      );

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
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

          // Send the JSON response only if the handler did not already send (e.g. streaming)
          if (!res.headersSent) {
            res.status(200).json(output.body);
          }

          // Get base log data and extend it with DB metrics
          const logData = {
            ...(await logAttributes(req, 200)),
          };

          // Add DB metrics if available
          if (this.options.dbMetrics?.getTotalQueryDuration) {
            const requestId = req.headers['x-request-id'] as string;
            const dbTime =
              this.options.dbMetrics.getTotalQueryDuration(requestId);
            (logData as any).dbDuration = dbTime;

            // Add query profile if the function is available
            if (this.options.dbMetrics?.getQueryDurationProfile) {
              const profile =
                this.options.dbMetrics.getQueryDurationProfile(requestId);
              if (profile) {
                (logData as any).dbProfile = profile;
              }
            }
          }

          if (req.user && 'authDuration' in req.user) {
            (logData as any).authDuration = req.user.authDuration;
          }

          req.logger.info(logData);
        } catch (error) {
          next(error);
        }
      },
    );

    // Catch-all route handler for unmatched XRPC routes
    app.use('/xrpc/*', () => {
      throw new NotFoundError('Not Found');
    });

    // Add error handling middleware
    app.use(errorHandler);

    return app;
  }

  public async start() {
    if (this.httpServer) {
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        this.httpServer = this.express.listen(this.options.port, '0.0.0.0', () => {
          const actualPort = this.httpServer?.address();
            const port = typeof actualPort === 'object' && actualPort?.port ? actualPort.port : this.options.port;
            this.logger.info(
              `🚀 ${this.options.name} service running on port ${port}`,
            );
            resolve();
        });
        this.httpServer.on('error', reject);
      });
    } catch (err) {
      this.httpServer = undefined;
      this.logger.error({ error: err }, 'Error starting server');
      process.exit(1);
    }

    if (!this.signalHandlersRegistered) {
      this.signalHandlersRegistered = true;
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
    }
  }

  public async shutdown() {
    this.logger.info('Shutting down server...');
    try {
      // Close the HTTP server first
      if (this.httpServer) {
        await new Promise<void>((resolve, reject) => {
          this.httpServer!.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        this.httpServer = undefined;
      }

      if (this.options.onShutdown) {
        await this.options.onShutdown();
      }
      // Only exit if we're not in a test environment
      if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
        process.exit(0);
      }
    } catch (err) {
      this.logger.error({ error: err }, 'Error during shutdown');
      // Only exit if we're not in a test environment
      if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
        process.exit(1);
      }
      // In test environments, just re-throw the error so tests can handle it properly
      throw err;
    }
  }
}
