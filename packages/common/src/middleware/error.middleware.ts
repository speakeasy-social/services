import { ServiceError } from '../errors.js';
import { createLogger } from '../logger.js';
import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// Define custom error interface
interface CustomError extends Error {
  statusCode?: number;
  errors?: any;
  code?: string;
}

// Define custom request interface with user
interface CustomRequest extends Request {
  user?: {
    type: string;
    did?: string;
    name?: string;
  };
}

const logger = createLogger({ serviceName: 'common' });

export const errorHandler: ErrorRequestHandler = (
  error: CustomError,
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  const path = req.url;
  const method = req.method;
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
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];
  const user = req.user?.type === 'user' ? req.user.did : req.user?.name;
  let errorMessage = 'Unhandled error occurred';
  let errorLog: {
    name: string;
    message: string;
    statusCode?: number;
    errors?: any;
    meta?: any;
    code?: string;
  };

  errorLog = {
    name: error.name,
    message: error.message,
    statusCode: error.statusCode,
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

  logger.error(
    {
      error: errorLog,
      path,
      method,
      status: statusCode,
      ip,
      userAgent,
      user,
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
