import { getPrismaClient } from './db.js';

export async function healthCheck() {
  const prisma = getPrismaClient();
  await prisma.$queryRaw`SELECT 1`;
}
