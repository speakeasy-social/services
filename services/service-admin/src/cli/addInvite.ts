#!/usr/bin/env node

// Load environment variables
import dotenv from 'dotenv';
import { getPrismaClient } from '../db.js';

dotenv.config({ path: process.env.ENV_FILE });

// Get the Prisma client
const prisma = getPrismaClient();

async function addInviteCode(
  code: string,
  key: string,
  value: string = 'true',
  totalUses: number = 3,
) {
  try {
    // Check if invite code already exists
    const existingCode = await prisma.inviteCode.findUnique({
      where: { code },
    });

    if (existingCode) {
      console.error(`Error: Invite code "${code}" already exists`);
      process.exit(1);
    }

    // Create the invite code
    const inviteCode = await prisma.inviteCode.create({
      data: {
        code,
        key,
        value,
        totalUses,
        remainingUses: totalUses,
      },
    });

    console.log('Invite code created successfully:');
    console.log(`- Code: ${inviteCode.code}`);
    console.log(`- Feature key: ${inviteCode.key}`);
    console.log(`- Feature value: ${inviteCode.value}`);
    console.log(`- Total uses: ${inviteCode.totalUses}`);
  } catch (error) {
    console.error('Error creating invite code:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: addInvite <code> <key> [value=true] [totalUses=3]');
  process.exit(1);
}

const [code, key, value = 'true', totalUsesStr = '3'] = args;
const totalUses = parseInt(totalUsesStr, 10);

if (isNaN(totalUses)) {
  console.error('Error: totalUses must be a number');
  process.exit(1);
}

// Execute the function
addInviteCode(code, key, value, totalUses).catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
