import { SessionService } from '../services/session.service.js';
import { createSessionRoutes } from '@speakeasy-services/session-management';

const sessionService = new SessionService();

export const methods = createSessionRoutes({
  serviceName: 'private-session',
  authorizationRecord: 'private_session',
  lexiconPrefix: 'social.spkeasy.privateSession',
  sessionService,
});
