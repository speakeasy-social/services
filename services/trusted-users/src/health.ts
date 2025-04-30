import { getPrismaClient } from './db.js';

export async function healthCheck() {
  const prisma = getPrismaClient();
  // The table may be empty, that's fine, just as long as an
  // exception is not thrown
  await prisma.trustedUser.findFirst();
}
