import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const prismaClientSingleton = () => {
  const logLevels = env.isProd
    ? ['error']
    : env.db.logging
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'];

  return new PrismaClient({
    log: logLevels,
  });
};

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (!env.isProd) {
  globalForPrisma.prisma = prisma;
}

const cleanup = async () => {
  await prisma.$disconnect().catch(() => {});
};

process.on('beforeExit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

export default prisma;

