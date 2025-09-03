import pino from 'pino';
import { ExtendedRequest } from './express-extensions.js';
import crypto from 'crypto';

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

/**
 * Extracts and formats logging attributes from an Express request and response status.
 * This function is typically used to create consistent log entries for HTTP requests.
 *
 * @param req - The Express request object with extended properties
 * @param status - The HTTP status code of the response
 * @returns An object containing relevant logging attributes including:
 *   - method: The HTTP method used
 *   - duration: Request processing time in milliseconds
 *   - status: The HTTP status code
 *   - ip: Client IP address
 *   - userAgent: Client's user agent string
 *   - user: User identifier (DID for users, name for other types)
 */
export async function logAttributes(req: ExtendedRequest, status: number) {
  const method = req.params.method;
  const ip = req.ip ? await hmac(req.ip) : undefined;
  const userAgent = req.headers['user-agent'];
  let user;

  if (req.user) {
    if (req.user.type === 'user') {
      // HMAC the user DID - safely handle missing DID
      const userDid = req.user.did;
      if (userDid && typeof userDid === 'string' && userDid.trim() !== '') {
        user = await hmac(userDid);
      } else {
        user = 'invalid-session-did';
      }
    } else {
      // No need to obscure which service made the request,
      // that's not private
      user = req.user.name;
    }
  }

  return {
    method,
    duration: Date.now() - req.startTime,
    status,
    ip,
    userAgent,
    user,
  };
}

async function hmac(data: string) {
  const secretKey = process.env.HMAC_SECRET;
  const logSalt = process.env.LOG_SALT;

  if (!secretKey || !logSalt) {
    throw new Error(
      'HMAC_SECRET and LOG_SALT environment variables must be set',
    );
  }

  return crypto
    .createHmac('sha256', secretKey)
    .update(data + logSalt)
    .digest('hex');
}
