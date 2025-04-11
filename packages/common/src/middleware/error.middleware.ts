import {
  ServiceError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  DatabaseError,
} from '../errors.js';
import { Errors } from '../utils/index.js';
import { createLogger } from '../logger.js';
import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';

const logger = createLogger({ serviceName: 'common' });

export const errorHandler: ErrorRequestHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const path = req.url;
  const method = req.method;

  // Handle known service errors
  if (error instanceof ServiceError) {
    logger.warn(
      {
        error: {
          name: error.name,
          message: error.message,
          statusCode: error.statusCode,
          errors: error.errors,
        },
        path,
        method,
      },
      'Service error occurred',
    );

    return res.status(error.statusCode).send({
      error: error.name,
      message: error.message,
      ...(error.errors && { errors: error.errors }),
    });
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    logger.warn(
      {
        error: {
          name: error.name,
          message: error.message,
          errors: (error as any).errors,
        },
        path,
        method,
      },
      'Validation error occurred',
    );

    return res.status(400).send({
      error: 'ValidationError',
      message: error.message,
      errors: (error as any).errors,
    });
  }

  // Handle unknown errors
  logger.error(
    {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      path,
      method,
    },
    'Unhandled error occurred',
  );

  return res.status(500).send({
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
  });
};
