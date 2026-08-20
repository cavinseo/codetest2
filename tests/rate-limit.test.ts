import { beforeEach, describe, expect, it } from 'vitest';
import {
    LOGIN_RATE_LIMIT,
    clearAllRateLimits,
    clientIpFrom,
    consumeRateLimit,
    resetRateLimit,
} from '../lib/rate-limit';

const RULE = { windowMs: 1000, max: 3 };

beforeEach(() => {
    clearAllRateLimits();
});

describe('consumeRateLimit', () => {
    it('max 까지는 허용하고 그다음부터 막는다', () => {
        for (let attempt = 1; attempt <= RULE.max; attempt++) {
            expect(consumeRateLimit('k', RULE).allowed).toBe(true);
        }

        expect(consumeRateLimit('k', RULE).allowed).toBe(false);
    });

    it('남은 횟수를 알려준다', () => {
        expect(consumeRateLimit('k', RULE).remaining).toBe(2);
        expect(consumeRateLimit('k', RULE).remaining).toBe(1);
        expect(consumeRateLimit('k', RULE).remaining).toBe(0);
    });

    it('윈도가 지나면 다시 허용한다', () => {
        const start = 1_000_000;
        for (let attempt = 0; attempt < RULE.max; attempt++) {
            consumeRateLimit('k', RULE, start);
        }
        expect(consumeRateLimit('k', RULE, start).allowed).toBe(false);

        // 윈도를 벗어난 시점
        expect(consumeRateLimit('k', RULE, start + RULE.windowMs + 1).allowed).toBe(true);
    });

    it('막혔을 때 다시 시도할 수 있는 시각을 알려준다', () => {
        const start = 1_000_000;
        for (let attempt = 0; attempt < RULE.max; attempt++) {
            consumeRateLimit('k', RULE, start);
        }

        const blocked = consumeRateLimit('k', RULE, start + 200);

        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('키가 다르면 서로 영향을 주지 않는다', () => {
        for (let attempt = 0; attempt < RULE.max; attempt++) consumeRateLimit('a', RULE);

        expect(consumeRateLimit('a', RULE).allowed).toBe(false);
        expect(consumeRateLimit('b', RULE).allowed).toBe(true);
    });

    it('막힌 뒤에도 카운터가 무한히 늘지 않는다', () => {
        const start = 1_000_000;
        for (let attempt = 0; attempt < RULE.max + 10; attempt++) {
            consumeRateLimit('k', RULE, start);
        }

        // 윈도가 지나면 정확히 max 번 다시 허용되어야 한다.
        const after = start + RULE.windowMs + 1;
        for (let attempt = 0; attempt < RULE.max; attempt++) {
            expect(consumeRateLimit('k', RULE, after).allowed).toBe(true);
        }
        expect(consumeRateLimit('k', RULE, after).allowed).toBe(false);
    });
});

describe('resetRateLimit', () => {
    it('로그인 성공 후 카운터를 비운다', () => {
        for (let attempt = 0; attempt < RULE.max; attempt++) consumeRateLimit('k', RULE);
        expect(consumeRateLimit('k', RULE).allowed).toBe(false);

        resetRateLimit('k');

        expect(consumeRateLimit('k', RULE).allowed).toBe(true);
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
