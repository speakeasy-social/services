import { PrismaClient } from './generated/prisma-client/index.js';

export async function healthCheck() {
  const prisma = new PrismaClient();
  // The table may be empty, that's fine, just as long as an
  // exception is not thrown
  await prisma.session.findFirst();
}
