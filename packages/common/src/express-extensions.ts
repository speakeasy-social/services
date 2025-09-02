import { AuthVerifierContext } from '@atproto/xrpc-server';
import { Ability } from './auth/ability.js';
import { createLogger } from './logger.js';
import { Request, Response } from 'express';
import { NoSessionError } from './errors.js';

export interface User {
  type: 'user';
  did: string;
  handle: string;
  token: string;
  authDuration: number;
}

export interface Service {
  type: 'service';
  name: string;
}

export interface ExtendedRequest extends Request {
  user?: User | Service;
  abilities?: Ability[];
  logger: ReturnType<typeof createLogger>;
  startTime: number;
  prefetch?: Record<string, any>;
}

export type RequestHandlerReturn = Promise<{ body: object }>;

export interface ExtendedAuthVerifierContext
  extends Omit<AuthVerifierContext, 'req'> {
  req: ExtendedRequest;
}

export type RequestHandler = (
  req: ExtendedRequest,
  res: Response,
) => RequestHandlerReturn;

/**
 * Safely extracts the DID from a request's user object.
 * Throws a NoSessionError if the user is not authenticated or the DID is missing/invalid.
 * This helps catch cases where malformed API responses result in undefined DIDs.
 *
 * @param req - The Express request object with user information
 * @returns The user's DID string
 * @throws NoSessionError if user is not authenticated or DID is missing/invalid
 */
export function getSessionDid(req: ExtendedRequest): string {
  if (!req.user) {
    throw new NoSessionError('User not authenticated');
  }
  
  if (req.user.type !== 'user') {
    throw new NoSessionError('Request is not from an authenticated user');
  }
  
  const userDid = (req.user as User).did;
  if (!userDid || typeof userDid !== 'string' || userDid.trim() === '') {
    throw new NoSessionError('User DID is missing or invalid - possible malformed authentication response', {
      userType: req.user.type,
      didValue: userDid,
      didType: typeof userDid
    });
  }
  
  return userDid;
}

