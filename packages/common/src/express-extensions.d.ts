import { AuthVerifierContext } from '@atproto/xrpc-server';
import { Request } from 'express';

interface User {
  did: string;
  handle: string;
}

interface ExtendedRequest extends Request {
  user?: User;
}

interface ExtendedAuthVerifierContext extends AuthVerifierContext {
  req: ExtendedRequest;
}