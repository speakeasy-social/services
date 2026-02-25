#!/usr/bin/env node

// Load environment variables
import dotenv from 'dotenv';
import { getPrismaClient } from '../db.js';
import { Prisma } from '../generated/prisma-client/index.js';
import type {
  ContributionType,
  ContributionPublicData,
  ContributionInternalData,
} from '../types/contribution.js';
import { CONTRIBUTION_TYPES } from '../types/contribution.js';

dotenv.config({ path: process.env.ENV_FILE });

const prisma = getPrismaClient();

type JsonValue = Prisma.InputJsonValue | typeof Prisma.JsonNull;

// Known fields from contribution.ts schemas
const PUBLIC_FIELDS = ['feature', 'isRegularGift', 'recognition'] as const;
const INTERNAL_FIELDS = ['amount', 'donationId', 'appeal'] as const;
const DONOR_ONLY_FIELDS = [
  'amount',
  'donationId',
  'appeal',
  'isRegularGift',
  'recognition',
] as const;

const BSKY_PUBLIC_API = 'https://public.api.bsky.app';
const LOCAL_PDS_API = 'http://localhost:2583';

function getApiHost(handle: string): string {
  // Use local PDS for .test handles (test environment)
  if (handle.endsWith('.test')) {
    return LOCAL_PDS_API;
  }
  return BSKY_PUBLIC_API;
}

async function resolveHandle(handle: string): Promise<string> {
  // Strip leading @ if present
  const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

  const apiHost = getApiHost(cleanHandle);
  const url = `${apiHost}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(cleanHandle)}`;

  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to resolve handle "${cleanHandle}": ${response.status} ${errorText}`,
    );
  }

  const data = (await response.json()) as { did: string };
  return data.did;
}

function printUsage(): void {
  console.error('Usage: addContribution <did|handle> <contribution> [json]');
  console.error('');
  console.error('Arguments:');
  console.error(
    '  did|handle    User DID (did:plc:...) or handle (@user.bsky.social or user.bsky.social)',
  );
  console.error(
    '  contribution  One of: donor, contributor, designer, engineer, testing',
  );
  console.error('  json          Optional JSON object with contribution data');
  console.error('');
  console.error('JSON fields:');
  console.error('  Public data (any type):');
  console.error('    feature        - Feature name (string)');
  console.error('');
  console.error('  Public data (donor only):');
  console.error(
    '    isRegularGift  - Whether this is a recurring donation (boolean)',
  );
  console.error('    recognition    - Recognition level/name (string)');
  console.error('');
  console.error('  Internal data (donor only):');
  console.error('    amount         - Amount in cents (number)');
  console.error('    donationId     - Stripe donation ID (string)');
  console.error('    appeal         - Appeal/campaign name (string)');
  console.error('');
  console.error('Examples:');
  console.error('  addContribution did:plc:abc123 donor');
  console.error('  addContribution @user.bsky.social donor');
  console.error(
    '  addContribution user.bsky.social donor \'{"isRegularGift": true}\'',
  );
  console.error('  addContribution did:plc:abc123 donor \'{"amount": 5000}\'');
  console.error(
    '  addContribution did:plc:abc123 donor \'{"recognition": "Founding Donor"}\'',
  );
  console.error(
    '  addContribution @user.bsky.social contributor \'{"feature": "dark-mode"}\'',
  );
  console.error('  addContribution did:plc:abc123 designer');
  console.error(
    '  addContribution did:plc:abc123 engineer \'{"feature": "api-integration"}\'',
  );
  console.error(
    '  addContribution did:plc:abc123 testing \'{"feature": "bug-fixes"}\'',
  );
  process.exit(1);
}

function isDid(value: string): boolean {
  return value.startsWith('did:');
}

async function resolveDidOrHandle(didOrHandle: string): Promise<string> {
  if (isDid(didOrHandle)) {
    return didOrHandle;
  }

  const did = await resolveHandle(didOrHandle);
  return did;
}

function validateContribution(
  contribution: string,
): contribution is ContributionType {
  return CONTRIBUTION_TYPES.includes(contribution as ContributionType);
}

type ContributionData = {
  publicData: ContributionPublicData | null;
  internalData: ContributionInternalData | null;
};

function buildContributionData(
  contribution: ContributionType,
  jsonArg: string | undefined,
): ContributionData {
  // Parse JSON if provided
  let parsed: Record<string, unknown> = {};
  if (jsonArg !== undefined) {
    try {
      parsed = JSON.parse(jsonArg);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        console.error('Error: JSON must be an object');
        process.exit(1);
      }
    } catch {
      console.error('Error: Invalid JSON');
      process.exit(1);
    }
  }

  // Warn about donor-only fields on non-donor types
  if (contribution !== 'donor') {
    const donorOnlyUsed = Object.keys(parsed).filter((key) =>
      DONOR_ONLY_FIELDS.includes(key as (typeof DONOR_ONLY_FIELDS)[number]),
    );
    if (donorOnlyUsed.length > 0) {
      console.warn(
        `Warning: ${donorOnlyUsed.join(', ')} are donor-only fields and will be ignored`,
      );
    }
  }

  // Separate fields into public vs internal
  const publicData: ContributionPublicData = {};
  const internalData: {
    amount?: number;
    donationId?: string;
    appeal?: string;
  } = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (PUBLIC_FIELDS.includes(key as (typeof PUBLIC_FIELDS)[number])) {
      // Public field
      if (
        contribution !== 'donor' &&
        DONOR_ONLY_FIELDS.includes(key as (typeof DONOR_ONLY_FIELDS)[number])
      ) {
        // Skip donor-only public fields for non-donors (already warned)
        continue;
      }
      (publicData as Record<string, unknown>)[key] = value;
    } else if (
      INTERNAL_FIELDS.includes(key as (typeof INTERNAL_FIELDS)[number])
    ) {
      // Internal field (donor only)
      if (contribution === 'donor') {
        (internalData as Record<string, unknown>)[key] = value;
      }
      // Skip for non-donors (already warned)
    } else {
      // Unknown field - warn and add to public data for forward compatibility
      console.warn(`Warning: Unknown field "${key}" - adding to public data`);
      (publicData as Record<string, unknown>)[key] = value;
    }
  }

  // Return constructed data
  const hasPublicData = Object.keys(publicData).length > 0;
  const hasInternalData = Object.keys(internalData).length > 0;

  return {
    publicData: hasPublicData ? publicData : null,
    internalData:
      contribution === 'donor' && hasInternalData
        ? (internalData as ContributionInternalData)
        : null,
  };
}

async function addContribution(
  did: string,
  contribution: ContributionType,
  publicData: ContributionPublicData | null,
  internalData: ContributionInternalData,
): Promise<void> {
  try {
    const contributionEntry = await prisma.contribution.create({
      data: {
        did,
        contribution,
        public:
          publicData === null ? Prisma.JsonNull : (publicData as JsonValue),
        internal:
          internalData === null ? Prisma.JsonNull : (internalData as JsonValue),
      },
    });

    const publicJson = contributionEntry.public
      ? JSON.stringify(contributionEntry.public)
      : 'null';
    console.log(
      `Added ${contributionEntry.contribution}: ${contributionEntry.did}, public: ${publicJson}`,
    );
  } catch (error) {
    console.error('Error creating contribution entry:', error);
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

const [didOrHandle, contribution, jsonArg] = args;

// Validate contribution type
if (!validateContribution(contribution)) {
  console.error(
    `Error: contribution must be one of: ${CONTRIBUTION_TYPES.join(', ')}`,
  );
  process.exit(1);
}

// Build and validate contribution data
const { publicData, internalData } = buildContributionData(
  contribution,
  jsonArg,
);

// Resolve handle to DID if needed, then execute
resolveDidOrHandle(didOrHandle)
  .then((did) => addContribution(did, contribution, publicData, internalData))
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    const isConnectionError =
      err instanceof TypeError && err.message.includes('fetch failed');

    if (isConnectionError) {
      const apiHost = getApiHost(didOrHandle);
      console.error(`Could not reach the AT Proto server at ${apiHost}`);
      if (didOrHandle.endsWith('.test')) {
        console.error('Hint: Make sure your local AT Proto server is running');
      }
    } else {
      console.error('Error:', message);
    }

    process.exit(1);
  });
