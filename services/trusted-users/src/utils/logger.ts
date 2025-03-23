import { createLogger } from '@speakeasy-services/common';
import { config } from '../config.js';

export default createLogger({
  serviceName: 'trusted-users',
  level: config.LOG_LEVEL || 'info',
});
