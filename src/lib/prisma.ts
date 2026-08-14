import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const effectiveDatabaseUrl =
  process.env.DATABASE_URL?.includes('.railway.internal') && process.env.DATABASE_PUBLIC_URL
    ? process.env.DATABASE_PUBLIC_URL
    : process.env.DATABASE_URL;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: effectiveDatabaseUrl ? { db: { url: effectiveDatabaseUrl } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

