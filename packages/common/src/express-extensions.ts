import { AuthVerifierContext } from '@atproto/xrpc-server';
import { Ability } from './auth/ability.js';
import { createLogger } from './logger.js';
import { Request, Response } from 'express';

export interface User {
  type: 'user';
  did: string;
  handle: string;
  token: string;
}

export interface Service {
  type: 'service';
  name: string;
  did?: string;
}

export interface ExtendedRequest extends Request {
  user?: User | Service;
  abilities?: Ability[];
  logger: ReturnType<typeof createLogger>;
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
