import { config } from 'dotenv';
import { resolve } from 'path';
import { Queue } from './index.js';

// Load environment variables from root .env file
const envPath = resolve(process.cwd(), '../../.env');
config({ path: envPath });

async function setup() {
  try {
    console.log('Setting up PgBoss...');
    const boss = Queue.getInstance();
    await boss.start();
    console.log('PgBoss setup complete!');
    console.log('Shutting down PgBoss... (may take a few seconds)');
    await boss.stop();
  } catch (error) {
    console.error('Failed to setup PgBoss:', error);
    process.exit(1);
  }
}

setup(); 