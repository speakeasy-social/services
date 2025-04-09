import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

// Load test environment variables
const envPath = resolve(process.cwd(), ".env.test");
config({ path: envPath });

// Initialize test database client
const prisma = new PrismaClient();

// Global test setup
beforeAll(async () => {
  // Connect to test database
  await prisma.$connect();

  // Run migrations
  // Note: You might want to use a separate migration command for tests
  // await prisma.$executeRaw`...`;

  // Set up test fixtures
  // await prisma.trustedUser.createMany({...});
});

// Global test cleanup
afterAll(async () => {
  // Clean up test data
  await prisma.trustedUser.deleteMany();

  // Disconnect from database
  await prisma.$disconnect();
});

// Reset state between tests
afterEach(async () => {
  // Clear test data between tests
  await prisma.trustedUser.deleteMany();
});
