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

export interface ExtendedRequest extends Request {
  user?: User | Service;
  abilities?: Ability[];
}
