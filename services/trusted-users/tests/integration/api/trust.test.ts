import request from "supertest";
import { Server } from "@speakeasy-services/service-base";
import { methods } from "../../src/routes/trust.routes.js";
import { lexicons } from "../../src/lexicon/index.js";
import { PrismaClient } from "@prisma/client";
import {
  ApiTest,
  ApiTestTransformer,
  runApiTests,
} from "../../../../shared/testing/api-test-generator";
import { generateTestToken } from "../../../../shared/testing/test-token";
import {
  authenticateToken,
  authorizationMiddleware,
} from "@speakeasy-services/common";
import {
  mockBlueskySession,
  cleanupBlueskySessionMocks,
  verifyBlueskySessionMocks,
} from "../../../../shared/testing/mock-bearer-tokens";

const authorDid = "did:example:alex-author";
const validRecipient = "did:example:valid-valery";
const invalidRecipient = "did:example:deleted-dave";

describe("Trusted Users API Tests", () => {
  let server: Server;
  let prisma: PrismaClient;
  const validToken = generateTestToken(authorDid);

  beforeAll(async () => {
    // Initialize Prisma client
    prisma = new PrismaClient();
    await prisma.$connect();

    // Initialize server
    server = new Server({
      name: "trusted-users",
      port: 3001,
      methods,
      lexicons,
      middleware: [authenticateToken, authorizationMiddleware],
    });

    await server.start();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await server.shutdown();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await prisma.trustedUser.deleteMany();
    // Setup mock for Bluesky session validation
    mockBlueskySession({ did: authorDid });
  });

  afterEach(() => {
    // Cleanup and verify mocks
    cleanupBlueskySessionMocks();
    verifyBlueskySessionMocks();
  });

  // Example transformer that generates multiple test cases for different authorization scenarios
  const authorizationTransformer: ApiTestTransformer = (test: ApiTest) => {
    return [
      // Original test as is
      test,
      // Test without token
      {
        ...test,
        note: `${test.note} - without token`,
        bearer: undefined,
        expectedStatus: 401,
        expectedBody: { error: "Unauthorized" },
      },
      // Test with wrong user token
      {
        ...test,
        note: `${test.note} - with wrong user token`,
        bearer: "wrong-user-token",
        expectedStatus: 403,
        expectedBody: { error: "Forbidden" },
      },
    ];
  };

  const apiTests: ApiTest[] = [
    {
      note: "empty list",
      endpoint: "social.spkeasy.graph.getTrusted",
      query: { did: authorDid },
      bearer: validToken,
      expectedBody: {
        trusted: [],
      },
    },
    {
      note: "with trusted users",
      endpoint: "social.spkeasy.graph.getTrusted",
      query: { did: authorDid },
      bearer: validToken,
      before: async () => {
        await prisma.trustedUser.create({
          data: {
            authorDid,
            recipientDid: validRecipient,
            createdAt: new Date(),
          },
        });
        // Ignores deleted trusts
        await prisma.trustedUser.create({
          data: {
            authorDid,
            recipientDid: invalidRecipient,
            createdAt: new Date(),
            deletedAt: new Date(),
          },
        });
      },
      expectedBody: {
        trusted: [{ did: validRecipient }],
      },
    },
    {
      note: "new user",
      method: "post",
      endpoint: "social.spkeasy.graph.addTrusted",
      body: { recipientDid: validRecipient },
      bearer: validToken,
      before: async () => {
        // Create another revipiend just to ensure we don't get confused
        await prisma.trustedUser.create({
          data: {
            authorDid,
            recipientDid: invalidRecipient,
            createdAt: new Date(),
            deletedAt: new Date(),
          },
        });
      },
      expectedBody: { success: true },
      assert: async () => {
        const trust = await prisma.trustedUser.findFirst({
          where: {
            authorDid,
            recipientDid: validRecipient,
            deletedAt: null,
          },
        });
        expect(trust).toBeTruthy();
      },
    },
    {
      note: "duplicate trust not allowed",
      method: "post",
      endpoint: "social.spkeasy.graph.addTrusted",
      body: { recipientDid: validRecipient },
      bearer: validToken,
      before: async () => {
        await prisma.trustedUser.create({
          data: {
            authorDid,
            recipientDid: validRecipient,
            createdAt: new Date(),
          },
        });
      },
      expectedStatus: 400,
      expectedBody: { error: "User is already trusted" },
    },
    {
      note: "re-trusting is ok",
      method: "post",
      endpoint: "social.spkeasy.graph.addTrusted",
      body: { recipientDid: validRecipient },
      bearer: validToken,
      before: async () => {
        await prisma.trustedUser.create({
          data: {
            authorDid,
            recipientDid: validRecipient,
            createdAt: new Date(),
            deletedAt: new Date(),
          },
        });
      },
      expectedStatus: 200,
      expectedBody: { success: true },
    },
    {
      note: "existing user",
      method: "post",
      endpoint: "social.spkeasy.graph.removeTrusted",
      body: { recipientDid: validRecipient },
      bearer: validToken,
      before: async () => {
        await prisma.trustedUser.create({
          data: {
            authorDid,
            recipientDid: validRecipient,
            createdAt: new Date(),
          },
        });
      },
      expectedBody: { success: true },
      assert: async () => {
        const trust = await prisma.trustedUser.findFirst({
          where: {
            authorDid,
            recipientDid: validRecipient,
          },
        });
        expect(trust).toBeTruthy();
        expect(trust?.deletedAt).not.toBeNull();
      },
    },
    {
      note: "non-existent user",
      method: "post",
      endpoint: "social.spkeasy.graph.removeTrusted",
      body: { recipientDid: invalidRecipient },
      bearer: validToken,
      expectedStatus: 404,
      expectedBody: { error: "User is not trusted" },
    },
  ];

  runApiTests(
    { server, prisma },
    apiTests,
    [authorizationTransformer],
    "Trusted Users API Tests",
  );
});
