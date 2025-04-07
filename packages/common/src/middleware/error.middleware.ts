import { FastifyRequest, FastifyReply } from 'fastify';
import { ServiceError, ValidationError, NotFoundError, AuthenticationError, AuthorizationError, DatabaseError } from '../errors.js';
import { Errors } from '../utils/index.js';
import { createLogger } from '../logger.js';

const logger = createLogger({ serviceName: 'common' });

export function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Handle known service errors
  if (error instanceof ServiceError) {
    logger.warn({ 
      error: {
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        errors: error.errors
      },
      path: request.url,
      method: request.method
    }, 'Service error occurred');
    
    return reply.status(error.statusCode).send({
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
      path: request.url,
      method: request.method
    }, 'Validation error occurred');
    
    return reply.status(400).send({
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
    path: request.url,
    method: request.method
  }, 'Unhandled error occurred');
  
  return reply.status(500).send({
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
  });
}
