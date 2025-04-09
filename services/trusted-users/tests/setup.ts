import { config } from "dotenv";
import { resolve } from "path";

// Load test environment variables
const envPath = resolve(process.cwd(), ".env.test");
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
