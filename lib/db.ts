import { PrismaClient } from '@prisma/client';

/**
 * عميل Prisma مفرد. في وضع التطوير يُخزَّن على globalThis حتى لا تُنشأ
 * اتصالات جديدة مع كل إعادة تحميل ساخنة.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
