import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient 싱글톤 인스턴스.
 * Next.js 가 개발 모드에서 핫 리로딩될 때 연결이 바닥나는 것을 방지합니다.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// 쿼리 로그는 기본으로 끈다. 원격 DB 는 요청 하나에도 왕복이 여러 번인데, 그 위에
// 모든 쿼리를 콘솔로 찍는 비용까지 얹히면 대량 작업이 눈에 띄게 느려진다(엑셀
// 워크북 가져오기가 특히 그렇다). 다만 이 로그로 트랜잭션 만료(P2028) 같은 문제를
// 찾아낸 적이 있으므로 없애지는 않고, 필요할 때만 PRISMA_LOG_QUERIES=1 로 켠다.
const logLevels: Array<'query' | 'error' | 'warn'> =
    process.env.NODE_ENV !== 'development' ? ['error']
        : process.env.PRISMA_LOG_QUERIES === '1' ? ['query', 'error', 'warn']
            : ['error', 'warn'];

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({ log: logLevels });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
