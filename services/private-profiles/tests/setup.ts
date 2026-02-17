import { beforeAll, afterAll, afterEach } from 'vitest';
import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables - try root .env.test first, then service .env.test, then .env
const rootEnvTestPath = resolve(process.cwd(), "../../.env.test");
const serviceEnvTestPath = resolve(process.cwd(), ".env.test");
const envPath = resolve(process.cwd(), ".env");

config({ path: rootEnvTestPath });
config({ path: serviceEnvTestPath });
config({ path: envPath });

// Global test setup
beforeAll(async () => {
  // Any global setup that doesn't involve Prisma
});

// Global test cleanup
afterAll(async () => {
  // Any global cleanup that doesn't involve Prisma
});

// Reset state between tests
afterEach(async () => {
  // Any cleanup between tests that doesn't involve Prisma
});
