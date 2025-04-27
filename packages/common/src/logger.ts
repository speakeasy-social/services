import pino from 'pino';
import { ExtendedRequest } from './express-extensions.js';

export interface LoggerOptions {
  serviceName: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger({
  serviceName,
  level = 'info',
  pretty = true,
}: LoggerOptions) {
  const options: pino.LoggerOptions = {
    level,
    base: {
      service: serviceName,
    },
  };

  if (pretty) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        translateTime: 'SYS:standard',
        clearScreen: false,
        singleLine: true,
      },
    };
  }

  return pino.pino(options);
}

export function logAttributes(req: ExtendedRequest, status: number) {
  const method = req.params.method;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];
  const user = req.user
    ? req.user.type === 'user'
      ? req.user.did
      : req.user.name
    : undefined;

  return {
    method,
    duration: Date.now() - req.startTime,
    status,
    ip,
    userAgent,
    user,
  };
}
