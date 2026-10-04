// 데이터베이스 기반 인증 요청 제한이 여러 서버 인스턴스에서도 유지되는지 확인한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Hit = { id: string; keyHash: string; attemptedAt: Date; expiresAt: Date };

const database = vi.hoisted(() => {
    const hits: Hit[] = [];
    const deleteMany = vi.fn(async (args?: { where?: { keyHash?: string; attemptedAt?: { lte: Date }; expiresAt?: { lte: Date } } }) => {
        const where = args?.where;
        const removed = hits.filter((hit) => !where
            || (where.keyHash === undefined || hit.keyHash === where.keyHash)
                && (where.attemptedAt?.lte === undefined || hit.attemptedAt <= where.attemptedAt.lte)
                && (where.expiresAt?.lte === undefined || hit.expiresAt <= where.expiresAt.lte));
        for (const hit of removed) hits.splice(hits.indexOf(hit), 1);
        return { count: removed.length };
    });
    const findMany = vi.fn(async (args: { where: { keyHash: string } }) => hits
        .filter((hit) => hit.keyHash === args.where.keyHash)
        .sort((left, right) => left.attemptedAt.getTime() - right.attemptedAt.getTime())
        .map(({ attemptedAt }) => ({ attemptedAt })));
    const create = vi.fn(async ({ data }: { data: Omit<Hit, 'id'> }) => {
        hits.push({ ...data, id: `hit_${hits.length}` });
    });
    const rateLimitHit = { deleteMany, findMany, create };
    const tx = { rateLimitHit, $queryRaw: vi.fn(async () => []) };
    return {
        hits,
        rateLimitHit,
        transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
});

vi.mock('../lib/prisma', () => ({
    prisma: {
        rateLimitHit: database.rateLimitHit,
        $transaction: database.transaction,
    },
}));

import {
    LOGIN_RATE_LIMIT,
    clearAllRateLimits,
    clientIpFrom,
    consumeRateLimit,
    resetRateLimit,
} from '../lib/rate-limit';

const RULE = { windowMs: 1000, max: 3 };

beforeEach(async () => {
    await clearAllRateLimits();
    vi.clearAllMocks();
});

describe('consumeRateLimit', () => {
    it('max 까지는 허용하고 그다음부터 막는다', async () => {
        for (let attempt = 1; attempt <= RULE.max; attempt++) {
            expect((await consumeRateLimit('k', RULE)).allowed).toBe(true);
        }

        expect((await consumeRateLimit('k', RULE)).allowed).toBe(false);
    });

    it('남은 횟수를 알려준다', async () => {
        expect((await consumeRateLimit('k', RULE)).remaining).toBe(2);
        expect((await consumeRateLimit('k', RULE)).remaining).toBe(1);
        expect((await consumeRateLimit('k', RULE)).remaining).toBe(0);
    });

    it('윈도가 지나면 다시 허용한다', async () => {
        const start = 1_000_000;
        for (let attempt = 0; attempt < RULE.max; attempt++) {
            await consumeRateLimit('k', RULE, start);
        }
        expect((await consumeRateLimit('k', RULE, start)).allowed).toBe(false);

        expect((await consumeRateLimit('k', RULE, start + RULE.windowMs + 1)).allowed).toBe(true);
    });

    it('막혔을 때 다시 시도할 수 있는 시각을 알려준다', async () => {
        const start = 1_000_000;
        for (let attempt = 0; attempt < RULE.max; attempt++) {
            await consumeRateLimit('k', RULE, start);
        }

        const blocked = await consumeRateLimit('k', RULE, start + 200);

        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('키가 다르면 서로 영향을 주지 않고 원본 키를 저장하지 않는다', async () => {
        for (let attempt = 0; attempt < RULE.max; attempt++) await consumeRateLimit('login:203.0.113.2:person@example.com', RULE);

        expect((await consumeRateLimit('login:203.0.113.2:person@example.com', RULE)).allowed).toBe(false);
        expect((await consumeRateLimit('login:203.0.113.2:other@example.com', RULE)).allowed).toBe(true);
        expect(database.hits.every((hit) => !hit.keyHash.includes('person@example.com'))).toBe(true);
    });

    it('새 서버 모듈도 이미 기록된 제한을 적용한다', async () => {
        for (let attempt = 0; attempt < RULE.max; attempt++) await consumeRateLimit('k', RULE);

        vi.resetModules();
        const reloaded = await import('../lib/rate-limit');

        expect((await reloaded.consumeRateLimit('k', RULE)).allowed).toBe(false);
    });
});

describe('resetRateLimit', () => {
    it('로그인 성공 후 해당 키의 카운터를 비운다', async () => {
        for (let attempt = 0; attempt < RULE.max; attempt++) await consumeRateLimit('k', RULE);
        expect((await consumeRateLimit('k', RULE)).allowed).toBe(false);

        await resetRateLimit('k');

        expect((await consumeRateLimit('k', RULE)).allowed).toBe(true);
    });
});

describe('clientIpFrom', () => {
    it('x-forwarded-for 의 첫 항목을 쓴다', () => {
        const headers = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });

        expect(clientIpFrom(headers)).toBe('203.0.113.9');
    });

    it('x-real-ip 로 폴백한다', () => {
        expect(clientIpFrom(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    });

    it('아무 헤더도 없으면 unknown', () => {
        expect(clientIpFrom(new Headers())).toBe('unknown');
    });
});

describe('로그인 제한 정책', () => {
    it('15분에 5회로 설정되어 있다', () => {
        expect(LOGIN_RATE_LIMIT).toEqual({ windowMs: 15 * 60 * 1000, max: 5 });
    });
});
