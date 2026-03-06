import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient 싱글톤 인스턴스.
 * Next.js 가 개발 모드에서 핫 리로딩될 때 연결이 바닥나는 것을 방지합니다.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
