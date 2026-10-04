// 인증 엔드포인트의 요청 제한을 데이터베이스에 기록해 모든 서버 인스턴스에서 공유한다.
import { createHash } from 'crypto';
import { prisma } from './prisma';

export interface RateLimitRule {
    /** 윈도 길이(밀리초) */
    windowMs: number;
    /** 윈도 안에서 허용할 최대 시도 횟수 */
    max: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    /** 다시 시도할 수 있을 때까지 남은 초. 허용된 경우 0. */
    retryAfterSeconds: number;
}

export const LOGIN_RATE_LIMIT: RateLimitRule = { windowMs: 15 * 60 * 1000, max: 5 };
export const SIGNUP_RATE_LIMIT: RateLimitRule = { windowMs: 60 * 60 * 1000, max: 3 };

function keyHash(key: string): string {
    return createHash('sha256').update(key).digest('hex');
}

/**
 * 시도를 1회 기록하고 허용 여부를 돌려준다.
 * 원본 이메일과 IP는 해시로 바꿔 저장하며, 만료된 기록은 요청 처리 중 함께 지운다.
 */
export async function consumeRateLimit(
    key: string,
    rule: RateLimitRule,
    now: number = Date.now()
): Promise<RateLimitResult> {
    const hash = keyHash(key);
    const attemptedAt = new Date(now);
    const windowStart = new Date(now - rule.windowMs);

    return prisma.$transaction(async (tx) => {
        await tx.rateLimitHit.deleteMany({ where: { expiresAt: { lte: attemptedAt } } });
        // 같은 키의 요청은 일렬로 처리해 두 인스턴스가 동시에 임계값을 통과하지 못하게 한다.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`rate-limit:${hash}`}))::text`;
        await tx.rateLimitHit.deleteMany({
            where: { keyHash: hash, attemptedAt: { lte: windowStart } },
        });
        const hits = await tx.rateLimitHit.findMany({
            where: { keyHash: hash },
            select: { attemptedAt: true },
            orderBy: { attemptedAt: 'asc' },
        });

        if (hits.length >= rule.max) {
            const oldest = hits[0].attemptedAt.getTime();
            return {
                allowed: false,
                remaining: 0,
                retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)),
            };
        }

        await tx.rateLimitHit.create({
            data: {
                keyHash: hash,
                attemptedAt,
                expiresAt: new Date(now + rule.windowMs),
            },
        });
        return { allowed: true, remaining: rule.max - hits.length - 1, retryAfterSeconds: 0 };
    });
}

/** 로그인 성공처럼 정상 사용자가 확인됐을 때 해당 키의 실패 카운터를 비운다. */
export async function resetRateLimit(key: string): Promise<void> {
    await prisma.rateLimitHit.deleteMany({ where: { keyHash: keyHash(key) } });
}

/** 테스트와 운영 점검에서 만료 전 기록까지 비우기 위한 용도. */
export async function clearAllRateLimits(): Promise<void> {
    await prisma.rateLimitHit.deleteMany();
}

/**
 * 요청자 IP 를 추정한다. Vercel 은 x-forwarded-for 를 붙여 준다.
 * 헤더는 위조 가능하지만 이메일 기반 키와 함께 써 한 키에 몰리는 것을 줄인다.
 */
export function clientIpFrom(headers: Headers): string {
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return headers.get('x-real-ip')?.trim() || 'unknown';
}
