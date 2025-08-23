import { ServiceError } from '../errors.js';
import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ExtendedRequest } from '../express-extensions.js';
import { logAttributes } from '../logger.js';
// Define custom error interface
interface CustomError extends Error {
  statusCode?: number;
  errors?: any;
  code?: string;
  details?: Record<string, any>;
  log?: Record<string, any>;
}

function relevantLine(stack: string) {
  if (!stack) return '';

  const lines = stack.split('\n').slice(1);
  for (const line of lines) {
    const match = line.match(/\(([^)]+)\)/);
    if (match) {
      const path = match[1];
      return path.match(/(?:\/packages\/|\/services\/).*/)?.[0];
    }
  }
  return '';
}

export const errorHandler: ErrorRequestHandler = async (
  error: CustomError,
  request: Request,
  res: Response,
  next: NextFunction,
) => {
  let isSilent = false;

  const req = request as ExtendedRequest;
  let responseObject: {
    error: string;
    message: string;
    errors?: any;
    code?: string;
    details?: Record<string, any>;
  } = {
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
  };
  let statusCode = 500;
  let errorMessage = 'Unhandled error occurred';
  let errorLog: {
    name: string;
    message: string;
    statusCode?: number;
    errors?: any;
    meta?: any;
    code?: string;
    stack?: string;
  };

  errorLog = {
    name: error.name,
    message: error.message,
    statusCode: error.statusCode,
    stack: error.stack,
    meta: error.log || error.details,
  };

  if (
    [
      'ValidationError',
      'NotFoundError',
      'AuthenticationError',
      'PrismaClientKnownRequestError',
      'ServiceError',
    ].includes(error.name) ||
    error instanceof ServiceError
  ) {
    errorLog.errors = error.errors;

    responseObject = {
      error: error.name,
      message: error.message,
      errors: error.errors,
      details: error.details,
    };
    errorMessage = `${error.name} occurred`;

    statusCode = error.statusCode || 400;

    isSilent = true;

    if (error.name === 'NotFoundError') {
      statusCode = 404;
      responseObject.code = 'NotFound';
    } else if (error.name === 'AuthenticationError') {
      statusCode = 401;
    }
  }

  if (error.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as PrismaClientKnownRequestError;
    errorLog = {
      ...errorLog,
      meta: prismaError.meta,
      code: prismaError.code,
    };
    statusCode = 400;
    if (prismaError.code === 'P2002') {
      responseObject = {
        error: 'InvalidRequest',
        message: `That ${prismaError.meta?.modelName} already exists`,
        code: 'AlreadyExists',
      };
      isSilent = true;
    } else {
      responseObject = {
        error: 'InternalServerError',
        message: 'Internal server error',
      };
    }
  }

  console.log(error.stack);
  req.logger.error(
    {
      ...(await logAttributes(req, statusCode)),
      relevantLine: relevantLine(errorLog.stack || ''),
      // Hide simple errors like 404s in production
      error:
        isSilent && process.env.NODE_ENV === 'production'
          ? undefined
          : errorLog,
    },
    errorMessage,
  );

  // If headers are already sent, let Express handle it
  if (res.headersSent) {
    return next(error);
  }

  res.status(statusCode).send(
    responseObject || {
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
    },
  );
};
