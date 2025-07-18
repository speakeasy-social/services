import { config } from 'dotenv';
import { resolve } from 'path';

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Load test environment variables
const envPath = resolve(process.cwd(), '.env.test');
config({ path: envPath });

// Also load service-specific test environment files
const services = ['user-keys', 'private-sessions', 'trusted-users', 'service-admin', 'media'];
services.forEach(service => {
  const serviceEnvPath = resolve(process.cwd(), `services/${service}/.env.test`);
  config({ path: serviceEnvPath });
});