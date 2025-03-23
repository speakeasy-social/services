import fastify from 'fastify';
import { config } from './config.js';
import { createServer, XRPCHandlerConfig } from '@atproto/xrpc-server';
import { LexiconDoc } from '@atproto/lexicon';

export interface ServerOptions {
  name: string;
  port?: number;
  methods: Record<string, XRPCHandlerConfig>;
  onShutdown?: () => Promise<void>;
}

export class Server {
  private app: fastify.FastifyInstance;
  private options: ServerOptions;
  private xrpcServer: ReturnType<typeof createServer>;

  constructor(options: ServerOptions) {
    this.options = options;
    this.app = fastify({
      logger: true
    });
    this.xrpcServer = createServer();
    this.setupXRPC();
  }

  private async setupXRPC() {
    // Register all methods with the XRPC server
    Object.entries(this.options.methods).forEach(([name, method]) => {
      this.xrpcServer.method(name, method);
    });

    // Mount XRPC routes in Fastify
    this.app.register(async (fastify) => {
      fastify.route({
        method: ['GET', 'POST'],
        url: '/xrpc/*',
        handler: (request, reply) => {
          return this.xrpcServer.router(request.raw, reply.raw);
        }
      });
    });
  }

  public async start() {
    const port = this.options.port || config.PORT;

    try {
      await this.app.listen({ port, host: '0.0.0.0' });
      console.log(`🚀 ${this.options.name} service running on port ${port}`);
    } catch (err) {
      console.error('Error starting server:', err);
      process.exit(1);
    }

    // Handle graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  private async shutdown() {
    console.log(`\n👋 Shutting down ${this.options.name} service...`);

    if (this.options.onShutdown) {
      await this.options.onShutdown();
    }

    await this.app.close();
    console.log('✅ Server closed');
    process.exit(0);
  }
}
