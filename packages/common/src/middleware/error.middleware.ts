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
}

export const errorHandler: ErrorRequestHandler = async (
  error: CustomError,
  request: Request,
  res: Response,
  next: NextFunction,
) => {
  const req = request as ExtendedRequest;
  let responseObject: {
    error: string;
    message: string;
    stack?: string;
    errors?: any;
    code?: string;
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
    meta: error.details,
  };

  if (
    [
      'ValidationError',
      'NotFoundError',
      'PrismaClientKnownRequestError',
      'ServiceError',
    ].includes(error.name) ||
    error instanceof ServiceError
  ) {
    errorLog.errors = error.errors;

    responseObject = {
      error: error.name,
      message: error.message,
      stack: error.stack,
      errors: error.errors,
    };
    errorMessage = `${error.name} occurred`;

    statusCode = error.statusCode || 400;

    if (error.name === 'NotFoundError') {
      statusCode = 404;
      responseObject.code = 'NotFound';
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
    } else {
      responseObject = {
        error: 'InternalServerError',
        message: 'Internal server error',
      };
    }
  }

  req.logger.error(
    {
      ...(await logAttributes(req, statusCode)),
      error: errorLog,
    },
    errorMessage,
  );

  return res.status(statusCode).send(
    responseObject || {
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
    },
  );
};
