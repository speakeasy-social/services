import { PrismaClient } from './generated/prisma-client/index.js';

export async function healthCheck() {
  const prisma = new PrismaClient();
  await prisma.userFeature.findFirst();
}
