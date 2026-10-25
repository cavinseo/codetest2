import { beforeEach, describe, expect, it } from 'vitest';
import {
    LOGIN_RATE_LIMIT,
    clearAllRateLimits,
    clientIpFrom,
    consumeRateLimit,
    rateLimitKeyCount,
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

describe('저장 키 정리 (B14)', () => {
    it('키가 많이 쌓이면 윈도가 지난 키를 치운다', () => {
        const start = 1_000_000;
        for (let index = 0; index < 5_000; index++) consumeRateLimit(`old-${index}`, RULE, start);
        expect(rateLimitKeyCount()).toBe(5_000);

        consumeRateLimit('new', RULE, start + RULE.windowMs + 1);

        expect(rateLimitKeyCount()).toBe(1);
        expect(consumeRateLimit('new', RULE, start + RULE.windowMs + 1).remaining).toBe(1);
    });

    it('살아 있는 키만으로도 상한을 넘으면 가장 오래된 키부터 버린다', () => {
        const longRule = { windowMs: 60_000, max: 3 };
        for (let index = 0; index <= 10_000; index++) consumeRateLimit(`k-${index}`, longRule, 1_000);

        expect(rateLimitKeyCount()).toBe(10_000);
        // 가장 먼저 생긴 키가 버려져 새로 시작한다.
        expect(consumeRateLimit('k-0', longRule, 1_000).remaining).toBe(2);
    });

    it('막힌 키는 마지막 시도에서 윈도가 지날 때까지 남는다', () => {
        const start = 1_000_000;
        for (let attempt = 0; attempt < RULE.max; attempt++) consumeRateLimit('blocked', RULE, start);
        consumeRateLimit('blocked', RULE, start + 500);
        for (let index = 0; index < 5_000; index++) consumeRateLimit(`other-${index}`, RULE, start + 900);

        expect(consumeRateLimit('blocked', RULE, start + 900).allowed).toBe(false);
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
    // 첫 항목은 클라이언트가 위조할 수 있어, 그 값을 바꿔 가며 제한을 우회할 수 있었다(B14).
    it('x-forwarded-for 는 가까운 프록시가 붙인 마지막 항목을 쓴다', () => {
        const headers = new Headers({ 'x-forwarded-for': 'spoofed-by-client, 203.0.113.9' });

        expect(clientIpFrom(headers)).toBe('203.0.113.9');
    });

    it('프록시가 채우는 x-real-ip 를 x-forwarded-for 보다 먼저 쓴다', () => {
        const headers = new Headers({ 'x-real-ip': '198.51.100.4', 'x-forwarded-for': '1.2.3.4' });

        expect(clientIpFrom(headers)).toBe('198.51.100.4');
    });

    it('x-forwarded-for 첫 항목을 바꿔도 같은 키가 된다', () => {
        const first = clientIpFrom(new Headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }));
        const second = clientIpFrom(new Headers({ 'x-forwarded-for': '2.2.2.2, 203.0.113.9' }));

        expect(first).toBe(second);
    });

    it('비어 있는 헤더 값은 unknown', () => {
        expect(clientIpFrom(new Headers({ 'x-real-ip': ' ', 'x-forwarded-for': ' , ' }))).toBe('unknown');
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
