#!/usr/bin/env node

// Seeds testimonials for dev environment.
// Expects contributions to already exist (added via CLI in dev-setup.sh).
// Looks up DIDs from the contribution table by contribution type.

import dotenv from 'dotenv';
import { getPrismaClient } from '../db.js';
import { Prisma } from '../generated/prisma-client/index.js';

dotenv.config({ path: process.env.ENV_FILE });

const prisma = getPrismaClient();

type JsonValue = Prisma.InputJsonValue | typeof Prisma.JsonNull;

async function findDidByContribution(
  contributionType: string,
): Promise<string | null> {
  const entry = await prisma.contribution.findFirst({
    where: { contribution: contributionType, deletedAt: null },
    select: { did: true },
  });
  return entry?.did ?? null;
}

async function seedTestimonials(): Promise<void> {
  // Look up DIDs from existing contributions
  const bobDid = await findDidByContribution('engineer');
  const carlaDid = await findDidByContribution('donor');

  if (!bobDid || !carlaDid) {
    const missing = [
      !bobDid && 'engineer (for bob)',
      !carlaDid && 'donor (for carla)',
    ].filter(Boolean);
    console.error(
      `Cannot seed testimonials: missing contributions for ${missing.join(', ')}`,
    );
    console.error('Run contribution:add commands first (see dev-setup.sh).');
    process.exit(1);
  }

  // Skip if testimonials already exist for these DIDs
  const existing = await prisma.testimonial.findFirst({
    where: { did: { in: [bobDid, carlaDid] } },
  });

  if (existing) {
    console.log('Testimonials already exist, skipping.');
    return;
  }

  // Create testimonials
  await prisma.testimonial.createMany({
    data: [
      {
        did: bobDid,
        content: {
          text: 'So glad I can help build good things on @social.spkeasy',
          facets: [
            {
              index: { byteStart: 40, byteEnd: 55 },
              features: [
                {
                  $type: 'app.bsky.richtext.facet#mention',
                  did: 'did:plc:social-spkeasy',
                },
              ],
            },
          ],
        } as JsonValue,
      },
      {
        did: carlaDid,
        content: { text: 'Lets go guys!' } as JsonValue,
      },
    ],
  });

  console.log('Seed testimonials created.');
}

seedTestimonials()
  .catch((err) => {
    console.error('Error seeding testimonials:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
