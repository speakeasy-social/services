import { Prisma, PrismaClient } from './generated/prisma-client/index.js';

const options: Prisma.PrismaClientOptions = {};

if (process.env.NODE_ENV === 'development' && process.env.PRISMA_LOG) {
  options.log = [
    {
      emit: 'event',
      level: 'query',
    },
  ];
}

const prisma = new PrismaClient(options);

if (options.log) {
  (prisma.$on as any)('query', (e: Prisma.QueryEvent) => {
    console.log('Query: ' + e.query);
    console.log('Duration: ' + e.duration + 'ms');
  });
}

export function getPrismaClient() {
  return prisma;
}
