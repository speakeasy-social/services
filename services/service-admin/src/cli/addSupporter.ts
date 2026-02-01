#!/usr/bin/env node

// Load environment variables
import dotenv from 'dotenv';
import { getPrismaClient } from '../db.js';
import { Prisma } from '../generated/prisma-client/index.js';

dotenv.config({ path: process.env.ENV_FILE });

const prisma = getPrismaClient();

type JsonValue = Prisma.InputJsonValue | typeof Prisma.JsonNull;

const VALID_CONTRIBUTIONS = ['founding_donor', 'donor', 'contributor'] as const;
type ContributionType = (typeof VALID_CONTRIBUTIONS)[number];

function printUsage(): void {
  console.error('Usage: addSupporter <did> <contribution> [detail]');
  console.error('');
  console.error('Arguments:');
  console.error('  did           User DID (must start with "did:")');
  console.error('  contribution  One of: founding_donor, donor, contributor');
  console.error('  detail        Required for donor (amount in cents) and contributor (feature name)');
  console.error('                Not allowed for founding_donor');
  console.error('');
  console.error('Examples:');
  console.error('  addSupporter did:plc:abc123 founding_donor');
  console.error('  addSupporter did:plc:abc123 donor 5000');
  console.error('  addSupporter did:plc:abc123 contributor dark-mode');
  process.exit(1);
}

function validateDid(did: string): boolean {
  return did.startsWith('did:');
}

function validateContribution(contribution: string): contribution is ContributionType {
  return VALID_CONTRIBUTIONS.includes(contribution as ContributionType);
}

function buildDetails(
  contribution: ContributionType,
  detail: string | undefined
): object | null {
  switch (contribution) {
    case 'founding_donor':
      if (detail !== undefined) {
        console.error('Error: founding_donor does not accept a detail argument');
        process.exit(1);
      }
      return null;

    case 'donor': {
      if (detail === undefined) {
        console.error('Error: donor requires an amount in cents');
        process.exit(1);
      }
      const amount = parseInt(detail, 10);
      if (isNaN(amount) || amount <= 0) {
        console.error('Error: amount must be a positive integer');
        process.exit(1);
      }
      return { amount };
    }

    case 'contributor':
      if (detail === undefined) {
        console.error('Error: contributor requires a feature name');
        process.exit(1);
      }
      return { feature: detail };
  }
}

async function addSupporter(
  did: string,
  contribution: ContributionType,
  details: object | null
): Promise<void> {
  try {
    const supporter = await prisma.supporter.create({
      data: {
        did,
        contribution,
        details: details === null ? Prisma.JsonNull : (details as JsonValue),
      },
    });

    console.log('Supporter entry created successfully:');
    console.log(`- ID: ${supporter.id}`);
    console.log(`- DID: ${supporter.did}`);
    console.log(`- Contribution: ${supporter.contribution}`);
    console.log(`- Details: ${supporter.details ? JSON.stringify(supporter.details) : 'null'}`);
    console.log(`- Created: ${supporter.createdAt.toISOString()}`);
  } catch (error) {
    console.error('Error creating supporter entry:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  printUsage();
}

const [did, contribution, detail] = args;

// Validate DID
if (!validateDid(did)) {
  console.error('Error: DID must start with "did:"');
  process.exit(1);
}

// Validate contribution type
if (!validateContribution(contribution)) {
  console.error(`Error: contribution must be one of: ${VALID_CONTRIBUTIONS.join(', ')}`);
  process.exit(1);
}

// Build and validate details
const details = buildDetails(contribution, detail);

// Execute
addSupporter(did, contribution, details).catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
