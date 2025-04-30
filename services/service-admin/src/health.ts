import { getPrismaClient } from './db.js';

export async function healthCheck() {
  const prisma = getPrismaClient();
  await prisma.userFeature.findFirst();
}
