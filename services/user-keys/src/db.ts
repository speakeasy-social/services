import { PrismaClient } from './generated/prisma-client/index.js';

const prisma = new PrismaClient();

export function getPrismaClient() {
  return prisma;
}
