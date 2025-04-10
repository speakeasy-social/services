import { AuthVerifierContext } from '@atproto/xrpc-server';
import { Ability } from './auth/ability.js';

export interface User {
  type: 'user';
  did: string;
  handle: string;
}

export interface Service {
  type: 'service';
  name: string;
  did?: string;
}

export interface Request {
  body?: any;
  query?: any;
  params?: any;
  headers?: any;
}

export interface ExtendedRequest extends Request {
  user: User | Service;
  abilities?: Ability[];
}

export interface ExtendedAuthVerifierContext
  extends Omit<AuthVerifierContext, 'req'> {
  req: ExtendedRequest;
}

export type RequestHandler = (
  req: ExtendedRequest,
  res: any,
  next: any,
) => void;
