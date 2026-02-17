import { SessionService } from '../services/session.service.js';
import { createSessionRoutes } from '@speakeasy-services/session-management';

const sessionService = new SessionService();

export const methods = createSessionRoutes({
  serviceName: 'private-profile',
  authorizationRecord: 'private_profile',
  lexiconPrefix: 'social.spkeasy.profileSession',
  sessionService,
});
