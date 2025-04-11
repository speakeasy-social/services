import express from 'express';
import { Express, Request, Response } from 'express';
import { validateEnv, baseSchema } from './config.js';
import { LexiconDoc } from '@atproto/lexicon';
import z from 'zod';
import { createLogger } from '@speakeasy-services/common';

// Extend Express Request type to include logger
declare global {
  namespace Express {
    interface Request {
      logger: ReturnType<typeof createLogger>;
    }
  }
}

export interface ServerOptions {
  name: string;
  port: number;
  methods: Record<
    string,
    { handler: (req: Request, res: Response) => Promise<{ body: object }> }
  >;
  middleware?: any[];
  onShutdown?: () => Promise<void>;
  lexicons?: LexiconDoc[];
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

    // Parse JSON bodies
    app.use(express.json());

    // Add request logger middleware
    app.use((req, res, next) => {
      req.logger = this.logger.child({
        requestId: (req.headers['x-request-id'] as string) || 'unknown',
        method: req.method,
        path: req.path,
      });
      next();
    });

    // Add middleware
    if (this.options.middleware) {
      for (const middleware of this.options.middleware) {
        app.use(middleware);
      }
    }

    // Mount XRPC routes
    app.all('/xrpc/:method', async (req: Request, res: Response) => {
      const startTime = Date.now();
      const method = req.params.method;

      // Get the method handler
      const methodHandler = this.options.methods[method];
      if (!methodHandler) {
        req.logger.warn({ method }, 'Method not found');
        res.status(404).json({ error: 'Method not found' });
        return;
      }

      // Call the method handler directly
      const output = await methodHandler.handler(req, res);
      if (!output || !('body' in output)) {
        req.logger.error({ method }, 'Invalid handler output');
        res.status(500).json({ error: 'Internal server error' });
        return;
      }

      // Send the JSON response
      res.status(200).json(output.body);

      req.logger.info({
        method,
        duration: Date.now() - startTime,
        status: 200,
      });
    });

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
