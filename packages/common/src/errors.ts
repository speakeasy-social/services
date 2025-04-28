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
  constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
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
