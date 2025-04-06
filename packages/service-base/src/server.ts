import fastify from 'fastify';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { validateEnv, baseSchema } from './config.js';
import { createServer, XRPCHandlerConfig, XRPCError } from '@atproto/xrpc-server';
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

interface RouteParams {
  method: string;
}

export class Server {
  private fastify: FastifyInstance;
  private config: ReturnType<typeof validateEnv<typeof baseSchema>>;
  private options: ServerOptions;
  private xrpcServer: ReturnType<typeof createServer>;

  constructor(options: ServerOptions) {
    this.options = options;
    this.config = validateEnv(z.object(baseSchema));
    this.xrpcServer = createServer(options.lexicons);
    this.fastify = this.createServer();
  }

  private createServer(): FastifyInstance {
    const app = fastify({
      logger: true
    });

    // Register all methods with the XRPC server
    Object.entries(this.options.methods).forEach(([name, method]) => {
      this.xrpcServer.method(name, method);
    });

    // Mount XRPC routes in Fastify
    app.register(async (fastify: FastifyInstance) => {
      fastify.route({
        method: ['GET', 'POST'],
        url: '/xrpc/:method',
        handler: async (request: FastifyRequest<{ Params: RouteParams }>, reply: FastifyReply) => {
          try {
            const result = await this.xrpcServer.router(request.raw, reply.raw);
            if (!reply.sent) {
              return reply.send(result);
            }
          } catch (error: unknown) {
            if (error instanceof XRPCError) {
              return reply.status(400).send({ error: error.message });
            } else {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
              return reply.status(500).send({ error: errorMessage });
            }
          }
        }
      });
    });

    if (this.options.middleware) {
      for (const middleware of this.options.middleware) {
        app.addHook('preHandler', middleware);
      }
    }

    return app;
  }

  public async start() {
    try {
      await this.fastify.listen({ port: this.options.port, host: '0.0.0.0' });
      console.log(`🚀 ${this.options.name} service running on port ${this.options.port}`);
    } catch (err) {
      console.error('Error starting server:', err);
      process.exit(1);
    }

    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  private async shutdown() {
    console.log(`\n👋 Shutting down ${this.options.name} service...`);

    if (this.options.onShutdown) {
      await this.options.onShutdown();
    }

    await this.fastify.close();
    console.log('✅ Server closed');
    process.exit(0);
  }
}
