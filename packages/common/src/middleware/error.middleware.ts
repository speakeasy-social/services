import { FastifyRequest, FastifyReply } from 'fastify';
import { ServiceError, ValidationError, NotFoundError, AuthenticationError, AuthorizationError, DatabaseError } from '../errors.js';
import { Errors } from '../utils/index.js';

export function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Handle known service errors
  if (error instanceof ServiceError) {
    return reply.status(error.statusCode).send({
      error: error.name,
      message: error.message,
      ...(error.errors && { errors: error.errors }),
    });
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    return reply.status(400).send({
      error: 'ValidationError',
      message: error.message,
      errors: (error as any).errors,
    });
  }

  // Handle unknown errors
  console.error('Unhandled error:', error);
  return reply.status(500).send({
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
  });
}
