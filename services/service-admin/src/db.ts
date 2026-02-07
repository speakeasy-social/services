import { Prisma, PrismaClient } from './generated/prisma-client/index.js';

const options: Prisma.PrismaClientOptions = {};

options.log = [
  {
    emit: 'event',
    level: 'query',
  },
];

const prisma = new PrismaClient(options);

export function getPrismaClient() {
  return prisma;
}
