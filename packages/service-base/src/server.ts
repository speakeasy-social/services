import express from "express";
import { Express, Request, Response } from "express";
import { validateEnv, baseSchema } from "./config.js";
import { createServer, XRPCHandlerConfig } from "@atproto/xrpc-server";
import { ResponseType, XRPCError } from "@atproto/xrpc";
import { LexiconDoc } from "@atproto/lexicon";
import z from "zod";
import { createLogger } from "@speakeasy-services/common";

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
  methods: Record<string, XRPCHandlerConfig>;
  middleware?: any[];
  onShutdown?: () => Promise<void>;
  lexicons?: LexiconDoc[];
}

export class Server {
  express: Express;
  private config: ReturnType<typeof validateEnv<typeof baseSchema>>;
  private options: ServerOptions;
  private xrpcServer: ReturnType<typeof createServer>;
  private logger: ReturnType<typeof createLogger>;

  constructor(options: ServerOptions) {
    this.options = options;
    this.config = validateEnv(z.object(baseSchema));
    this.xrpcServer = createServer(options.lexicons);
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
      res.header("Access-Control-Allow-Origin", "http://localhost:19006");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization",
      );

      // Handle preflight requests
      if (req.method === "OPTIONS") {
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
        requestId: (req.headers["x-request-id"] as string) || "unknown",
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

    // Register all methods with the XRPC server
    Object.entries(this.options.methods).forEach(([name, method]) => {
      this.xrpcServer.method(name, method);
    });

    // Mount XRPC routes
    app.all("/xrpc/:method", async (req: Request, res: Response) => {
      const startTime = Date.now();
      const method = req.params.method;

      try {
        // Create the XRPC request context
        const xrpcReq = {
          req,
          res,
          params: {
            method,
            ...Object.fromEntries(
              Object.entries(req.query).map(([key, value]) => [
                key,
                Array.isArray(value) ? value[0] : value,
              ]),
            ),
          },
          input: req.body,
          auth: {
            credentials: req.headers.authorization,
            artifacts: {},
          },
          resetRouteRateLimits: async () => {
            // TODO: Implement rate limiting
            req.logger.debug("Rate limits reset");
            return Promise.resolve();
          },
        };

        // Get the method handler
        const methodHandler = this.options.methods[method];
        if (!methodHandler) {
          req.logger.warn({ method }, "Method not found");
          res.status(404).json({ error: "Method not found" });
          return;
        }

        // Call the method handler directly
        const output = await methodHandler.handler(xrpcReq);
        if (!output || !("body" in output)) {
          req.logger.error({ method }, "Invalid handler output");
          res.status(500).json({ error: "Internal server error" });
          return;
        }

        // Send the JSON response
        res.status(200).json(output.body);

        req.logger.info({
          method,
          duration: Date.now() - startTime,
          status: 200,
        });
      } catch (error: unknown) {
        const duration = Date.now() - startTime;

        if (error instanceof XRPCError) {
          const status = Number(error.status);
          req.logger.warn(
            {
              method,
              duration,
              status,
              error: error.error || "InternalServerError",
              message: error.message,
            },
            "Request failed with XRPC error",
          );

          res.status(isNaN(status) ? 400 : status).json({
            error: error.error || "InternalServerError",
            message: error.message,
          });
        } else {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";
          req.logger.error(
            {
              method,
              duration,
              error: error instanceof Error ? error : { message: errorMessage },
              status: 500,
            },
            "Request failed with unexpected error",
          );

          res.status(500).json({
            error: "InternalServerError",
            message: errorMessage,
          });
        }
      }
    });

    return app;
  }

  public async start() {
    try {
      this.express.listen(this.options.port, "0.0.0.0", () => {
        this.logger.info(
          `🚀 ${this.options.name} service running on port ${this.options.port}`,
        );
      });
    } catch (err) {
      this.logger.error({ error: err }, "Error starting server");
      process.exit(1);
    }

    process.on("SIGTERM", () => this.shutdown());
    process.on("SIGINT", () => this.shutdown());
  }

  private async shutdown() {
    this.logger.info("Shutting down server...");
    try {
      if (this.options.onShutdown) {
        await this.options.onShutdown();
      }
      process.exit(0);
    } catch (err) {
      this.logger.error({ error: err }, "Error during shutdown");
      process.exit(1);
    }
  }
}
