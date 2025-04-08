import { XRPCReqContext, HandlerOutput } from '@atproto/xrpc-server';
import { ServiceError, ValidationError, NotFoundError, AuthenticationError, AuthorizationError, DatabaseError } from '../errors.js';
import { Errors } from '../utils/index.js';
import { createLogger } from '../logger.js';

const logger = createLogger({ serviceName: 'common' });

export function errorHandler(
  error: Error,
  ctx: XRPCReqContext,
  reply: HandlerOutput
) {
  // Use express req and res for path, method, and status
  const path = ctx.req.url;
  const method = ctx.req.method;

  // Handle known service errors
  if (error instanceof ServiceError) {
    logger.warn({ 
      error: {
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        errors: error.errors
      },
      path,
      method
    }, 'Service error occurred');
    
    return ctx.res.status(error.statusCode).send({
      error: error.name,
      message: error.message,
      ...(error.errors && { errors: error.errors }),
    });
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    logger.warn({ 
      error: {
        name: error.name,
        message: error.message,
        errors: (error as any).errors
      },
      path,
      method
    }, 'Validation error occurred');
    
    return ctx.res.status(400).send({
      error: 'ValidationError',
      message: error.message,
      errors: (error as any).errors,
    });
  }

  // Handle unknown errors
  logger.error({ 
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    path,
    method
  }, 'Unhandled error occurred');
  
  return ctx.res.status(500).send({
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
  });
}
