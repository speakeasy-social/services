export class ServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errors?: unknown[],
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class ValidationError extends ServiceError {
  public code?: string;

  constructor(
    message: string,
    public details?: Record<string, any>,
    code?: string,
  ) {
    super(message, 400);
    this.name = 'ValidationError';
    this.details = details;
    this.code = code;
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string) {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class AuthenticationError extends ServiceError {
  constructor(message: string) {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ServiceError {
  constructor(
    message: string,
    public details?: Record<string, any>,
  ) {
    super(message, 403);
    this.name = 'AuthorizationError';
    this.details = details;
  }
}

export class DatabaseError extends ServiceError {
  constructor(message: string) {
    super(message, 500);
    this.name = 'DatabaseError';
  }
}

export class ErrorWithDetails extends ServiceError {
  constructor(
    name: string,
    message: string,
    public statusCode: number,
    public details: Record<string, any>,
  ) {
    super(message, statusCode);
    this.name = name;
    this.details = details;
  }
}

export class ErrorWithLog extends ServiceError {
  constructor(
    name: string,
    message: string,
    public statusCode: number,
    public log: Record<string, any>,
  ) {
    super(message, statusCode);
    this.name = name;
    this.log = log;
  }
}

export class RateLimitError extends ErrorWithDetails {
  constructor(message: string, details?: Record<string, any>) {
    super('RateLimitError', message, 429, details ?? {});
  }
}

export class NoSessionError extends ServiceError {
  constructor(
    message: string = 'This operation requires the user to have a session but cannot find the session',
    public details?: Record<string, any>,
  ) {
    super(message, 400);
    this.name = 'NoSessionError';
    this.details = details;
  }
}

