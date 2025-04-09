/**
 * API Test Generator
 *
 * A declarative testing framework for API endpoints that allows defining test cases
 * as objects and automatically generates and runs the tests.
 *
 * Features:
 * - Declarative test definition using objects
 * - Support for multiple HTTP methods (GET, POST, etc.)
 * - Automatic handling of query parameters, request bodies, and headers
 * - Built-in support for bearer token authentication
 * - Test transformers for generating multiple test cases from a single definition
 * - Setup and cleanup hooks for test preparation
 * - Custom assertions for verifying test results
 *
 * Usage:
 * ```typescript
 * const apiTests: ApiTest[] = [
 *   {
 *     note: "Get user profile",
 *     endpoint: "user.profile",
 *     query: { id: "123" },
 *     bearer: "valid-token",
 *     expectedBody: { name: "John Doe" }
 *   }
 * ];
 *
 * runApiTests({ server, prisma }, apiTests, [], "User API Tests");
 * ```
 *
 * Test Transformers:
 * Transformers can be used to generate multiple test cases from a single definition.
 * For example, an authorization transformer can generate test cases for different
 * authentication scenarios:
 * ```typescript
 * const authTransformer: ApiTestTransformer = (test: ApiTest) => [
 *   test, // original test
 *   { ...test, bearer: undefined, expectedStatus: 401 }, // no token
 *   { ...test, bearer: "wrong-token", expectedStatus: 403 } // wrong token
 * ];
 * ```
 *
 * @module api-test-generator
 */

import request from "supertest";
import { Server } from "@speakeasy-services/service-base";
import { after } from "node:test";
import { before } from "node:test";

/**
 * Interface defining the structure of an API test case.
 *
 * @example
 * ```typescript
 * const test: ApiTest = {
 *   note: "Get user profile",
 *   endpoint: "user.profile",
 *   query: { id: "123" },
 *   bearer: "valid-token",
 *   expectedBody: { name: "John Doe" }
 * };
 * ```
 */
export interface ApiTest {
  /** A descriptive note about what the test is checking */
  note: string;
  /** HTTP method to use for the request. Defaults to "get" if not specified */
  method?: "get" | "post" | "put" | "delete";
  /** The API endpoint to test, without the /xrpc prefix */
  endpoint: string;
  /** Query parameters to include in the request */
  query?: Record<string, any>;
  /** Request body for POST/PUT requests */
  body?: Record<string, any>;
  /** Additional headers to include in the request */
  headers?: Record<string, string>;
  /** Bearer token for authentication. Will be added as Authorization header */
  bearer?: string;
  /** Expected HTTP status code. Defaults to 200 if not specified */
  expectedStatus?: number;
  /** Expected response body to match against */
  expectedBody: Record<string, any>;
  /** Setup function to run before the test */
  before?: () => Promise<void>;
  /** Cleanup function to run after the test */
  after?: () => Promise<void>;
  /** Additional assertions to run after the main test */
  assert?: () => Promise<void>;
}

/**
 * Type for functions that can transform a test case into one or more test cases.
 * Useful for generating multiple test variations from a single definition.
 *
 * @example
 * ```typescript
 * const authTransformer: ApiTestTransformer = (test: ApiTest) => [
 *   test, // original test
 *   { ...test, bearer: undefined, expectedStatus: 401 }, // no token
 *   { ...test, bearer: "wrong-token", expectedStatus: 403 } // wrong token
 * ];
 * ```
 */
export interface ApiTestTransformer {
  (test: ApiTest): ApiTest | ApiTest[];
}

export interface ApiTestRunnerOptions {
  server: Server;
  prisma?: any; // Using any here since PrismaClient type varies by service
}

const ensureXrpcPrefix = (endpoint: string): string => {
  return endpoint.startsWith("/") ? endpoint : `/xrpc/${endpoint}`;
};

export const createApiTestRunner = (options: ApiTestRunnerOptions) => {
  const { server, prisma } = options;

  return async (test: ApiTest) => {
    const method = test.method || "get";
    let testName = `${method} ${test.endpoint}`;
    if (test.note) {
      testName = `${testName} - ${test.note}`;
    }

    describe(testName, () => {
      let response: any;
      let requestBuilder: request.Test;

      before(async () => {
        // Run before hook if provided
        if (test.before) {
          await test.before();
        }

        // Build the request
        requestBuilder = request(server.express)[method](
          ensureXrpcPrefix(test.endpoint),
        );

        // Add query params if provided
        if (test.query) {
          requestBuilder.query(test.query);
        }

        // Add body if provided
        if (test.body) {
          requestBuilder.send(test.body);
        }

        // Add headers if provided
        if (test.headers) {
          Object.entries(test.headers).forEach(([key, value]) => {
            requestBuilder.set(key, value);
          });
        }

        // Add bearer token if provided
        if (test.bearer) {
          requestBuilder.set("Authorization", `Bearer ${test.bearer}`);
        }
      });

      it("should return expected response", async () => {
        // Execute request
        response = await requestBuilder.expect(test.expectedStatus || 200);

        expect(response.body).toEqual(test.expectedBody);
      });

      if (test.assert) {
        it("should satisfy additional assertions", async () => {
          await test.assert();
        });
      }

      if (test.after) {
        after(async () => {
          await test.after();
        });
      }
    });
  };
};

/**
 * Runs a suite of API tests with optional transformers.
 *
 * @param options - Configuration options for the test runner
 * @param options.server - The Express server instance to test against
 * @param options.prisma - Optional Prisma client for database operations
 * @param tests - Array of test cases to run
 * @param testTransformers - Optional array of transformers to apply to the tests
 * @param describeName - Optional name for the test suite. Defaults to "API Tests"
 *
 * @example
 * ```typescript
 * const tests: ApiTest[] = [
 *   {
 *     note: "Get user profile",
 *     endpoint: "user.profile",
 *     query: { id: "123" },
 *     expectedBody: { name: "John Doe" }
 *   }
 * ];
 *
 * const transformers = [
 *   (test) => [
 *     test,
 *     { ...test, bearer: undefined, expectedStatus: 401 }
 *   ]
 * ];
 *
 * runApiTests({ server, prisma }, tests, transformers, "User API Tests");
 * ```
 */
export const runApiTests = (
  options: ApiTestRunnerOptions,
  tests: ApiTest[],
  testTransformers: ApiTestTransformer[] = [],
  describeName: string = "API Tests",
) => {
  const runTest = createApiTestRunner(options);

  let testSuite = tests;

  // Apply transformers
  testTransformers.forEach((transformer) => {
    testSuite = testSuite.flatMap((test) => {
      const result = transformer(test);
      return Array.isArray(result) ? result : [result];
    });
  });

  describe(describeName, () => {
    testSuite.forEach((test) => {
      runTest(test);
    });
  });
};
