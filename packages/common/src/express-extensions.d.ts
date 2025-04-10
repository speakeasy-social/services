import { AuthVerifierContext } from '@atproto/xrpc-server';
import { Request } from 'express';

interface User {
  type: string;
  did: string;
  handle: string;
}

interface Service {
  type: string;
  name: string;
}

interface ExtendedRequest extends Request {
  user?: User | Service;
  abilities?: Ability[];
}

interface ExtendedAuthVerifierContext extends AuthVerifierContext {
  req: ExtendedRequest;
}
