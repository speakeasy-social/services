import express from 'express';
import { Express, Request, Response } from 'express';
import { validateEnv, baseSchema } from './config.js';
import { createServer, XRPCHandlerConfig } from '@atproto/xrpc-server';
import { ResponseType, XRPCError } from '@atproto/xrpc';
import { LexiconDoc } from '@atproto/lexicon';
import z from 'zod';

export interface ServerOptions {
  name: string;
  port: number;
  methods: Record<string, XRPCHandlerConfig>;
  middleware?: any[];
  onShutdown?: () => Promise<void>;
  lexicons?: LexiconDoc[];
}

export class Server {
  private express: Express;
  private config: ReturnType<typeof validateEnv<typeof baseSchema>>;
  private options: ServerOptions;
  private xrpcServer: ReturnType<typeof createServer>;

  constructor(options: ServerOptions) {
    this.options = options;
    this.config = validateEnv(z.object(baseSchema));
    this.xrpcServer = createServer(options.lexicons);
    this.express = this.createServer();
  }

  private createServer(): Express {
    const app = express();

    // Enable CORS for Bluesky client
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', 'http://localhost:19006');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      
      next();
    });

    // Parse JSON bodies
    app.use(express.json());

    // Register all methods with the XRPC server
    Object.entries(this.options.methods).forEach(([name, method]) => {
      this.xrpcServer.method(name, method);
    });

    // Mount XRPC routes
    app.all('/xrpc/:method', async (req: Request, res: Response) => {
      try {
        // Create the XRPC request context
        const xrpcReq = {
          req,
          res,
          params: {
            method: req.params.method,
            ...Object.fromEntries(
              Object.entries(req.query).map(([key, value]) => [
                key,
                Array.isArray(value) ? value[0] : value
              ])
            )
          },
          input: req.body,
          auth: {
            credentials: req.headers.authorization,
            artifacts: {}
          },
          resetRouteRateLimits: async () => {
            // TODO: Implement rate limiting
            console.log('Rate limits reset');
            return Promise.resolve();
          }
        };

        // Get the method handler
        const method = this.options.methods[req.params.method];
        if (!method) {
          res.status(404).json({ error: 'Method not found' });
          return;
        }

        // Call the method handler directly
        const output = await method.handler(xrpcReq);
        if (!output || !('body' in output)) {
          res.status(500).json({ error: 'Internal server error' });
          return;
        }

        // Send the JSON response
        res.status(200).json(output.body);
      } catch (error: unknown) {
        if (error instanceof XRPCError) {
          const status = Number(error.status);
          res.status(isNaN(status) ? 400 : status).json({ 
            error: error.error || 'InternalServerError',
            message: error.message 
          });
        } else {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          res.status(500).json({ 
            error: 'InternalServerError',
            message: errorMessage 
          });
        }
      }
    });

    // Add middleware
    if (this.options.middleware) {
      for (const middleware of this.options.middleware) {
        app.use(middleware);
      }
    }

    return app;
  }

  public async start() {
    try {
      this.express.listen(this.options.port, '0.0.0.0', () => {
        console.log(`🚀 ${this.options.name} service running on port ${this.options.port}`);
      });
    } catch (err) {
      console.error('Error starting server:', err);
      process.exit(1);
    }

    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  private async shutdown() {
    console.log('Shutting down server...');
    try {
      if (this.options.onShutdown) {
        await this.options.onShutdown();
      }
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  }
}
