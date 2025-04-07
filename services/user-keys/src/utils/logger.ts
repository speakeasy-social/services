import config from '../config.js';
import { createLogger } from '@speakeasy-services/common';

export default createLogger({
  serviceName: 'user-keys',
  level: config.LOG_LEVEL
});
