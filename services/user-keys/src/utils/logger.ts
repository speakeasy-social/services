import { createLogger } from '@speakeasy-services/common';
import { config } from '../config.js';

export default createLogger({
  serviceName: 'user-keys',
  level: config.NODE_ENV === 'development' ? 'debug' : 'info',
});
