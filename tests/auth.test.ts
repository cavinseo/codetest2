import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
    encodeSessionCookie,
    getSessionUser,
    requireAuth,
    verifySessionCookie,
    type SessionUser,
} from '../lib/auth';
import { prisma } from '../lib/prisma';
import { POST as logout } from '../app/api/auth/logout/route';

vi.mock('../lib/prisma', () => ({
    prisma: { user: { findUnique: vi.fn() } },
}));

const findUser = vi.mocked(prisma.user.findUnique);

function requestWithSessionCookie(cookieValue?: string): NextRequest {
    return new NextRequest('http://localhost/test', {
        headers: cookieValue ? { cookie: `session=${cookieValue}` } : {},
    });
}

const SESSION: SessionUser = {
    userId: 'user_1',
    email: 'user@example.com',
    name: 'Test User',
};

function approvedUser(overrides: Record<string, unknown> = {}) {
    return {
        id: SESSION.userId,
        email: SESSION.email,
        name: SESSION.name,
        status: 'APPROVED',
        isAdmin: false,
        sessionVersion: 0,
        // requireAuth 가 온보딩까지 보므로 기본값을 완료 상태로 둔다.
        // 없으면 기존 테스트가 전부 403 onboarding_required 로 떨어진다.
        mustChangePassword: false,
        profile: {
            organization: '기관', phone: '010-0000-0000',
            companyName: '회사', industry: '제조',
        },
        ...overrides,
    };
}

beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    findUser.mockResolvedValue(approvedUser() as never);
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

describe('세션 쿠키 서명', () => {
    it('서명된 쿠키를 받아들인다', () => {
        const cookieValue = encodeSessionCookie(SESSION);

        expect(getSessionUser(requestWithSessionCookie(cookieValue))).toEqual(SESSION);
    });

    it('변조된 쿠키를 거부한다', () => {
        const cookieValue = encodeSessionCookie(SESSION);
        const [payload, signature] = cookieValue.split('.');
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        decoded.userId = 'user_2';
        const tamperedPayload = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');

        expect(getSessionUser(requestWithSessionCookie(`${tamperedPayload}.${signature}`))).toBeNull();
    });

    it('서명 없는 평문 JSON 쿠키를 어떤 환경에서도 거부한다', () => {
        const unsigned = JSON.stringify(SESSION);

        // 예전에는 NODE_ENV 가 production 이 아니면 이 쿠키로 아무나 사칭할 수 있었다.
        for (const env of ['production', 'development', 'test']) {
            vi.stubEnv('NODE_ENV', env);
            expect(getSessionUser(requestWithSessionCookie(unsigned))).toBeNull();
        }
    });

    it('SESSION_SECRET 이 없으면 환경과 무관하게 실패한다', () => {
        vi.stubEnv('SESSION_SECRET', '');
        vi.stubEnv('NEXTAUTH_SECRET', '');
        vi.stubEnv('NODE_ENV', 'development');

        expect(() => encodeSessionCookie(SESSION)).toThrow(/SESSION_SECRET/);
    });
});

describe('세션 만료', () => {
    it('발급 시 exp 와 ver 를 서명 안에 담는다', () => {
        const payload = verifySessionCookie(encodeSessionCookie(SESSION, { sessionVersion: 7 }));

        expect(payload?.ver).toBe(7);
        expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('만료된 쿠키를 거부한다', () => {
        const expired = encodeSessionCookie(SESSION, { maxAgeSeconds: -1 });

        expect(verifySessionCookie(expired)).toBeNull();
        expect(getSessionUser(requestWithSessionCookie(expired))).toBeNull();
    });

    it('exp 가 없는 옛 형식 쿠키는 거부한다', () => {
        // 이 필드가 생기기 전에 발급된 쿠키는 영구 유효였다. 남겨 두지 않는다.
        const legacy = Buffer.from(JSON.stringify(SESSION), 'utf8').toString('base64url');
        const { createHmac } = require('crypto') as typeof import('crypto');
        const signature = createHmac('sha256', 'test-secret').update(legacy).digest('base64url');

        expect(verifySessionCookie(`${legacy}.${signature}`)).toBeNull();
    });
});

describe('requireAuth', () => {
    it('쿠키가 없으면 401', async () => {
        const result = await requireAuth(requestWithSessionCookie());

        expect(result).toBeInstanceOf(NextResponse);
        expect((result as NextResponse).status).toBe(401);
    });

    it('승인된 계정은 통과시키고 isAdmin 을 DB 값으로 돌려준다', async () => {
        findUser.mockResolvedValue(approvedUser({ isAdmin: true }) as never);

        const result = await requireAuth(requestWithSessionCookie(encodeSessionCookie(SESSION)));

        expect(result).not.toBeInstanceOf(NextResponse);
        expect(result).toMatchObject({ userId: SESSION.userId, isAdmin: true });
    });

    it('승인이 취소된 계정은 쿠키가 멀쩡해도 403', async () => {
        const cookie = encodeSessionCookie(SESSION, { sessionVersion: 0 });
        findUser.mockResolvedValue(approvedUser({ status: 'PENDING' }) as never);

        const result = await requireAuth(requestWithSessionCookie(cookie));

        expect((result as NextResponse).status).toBe(403);
    });

    it('sessionVersion 이 올라가면 기존 쿠키를 거부한다', async () => {
        const cookie = encodeSessionCookie(SESSION, { sessionVersion: 0 });
        // 비밀번호 변경·승인 취소로 서버 쪽 버전이 올라간 상황
        findUser.mockResolvedValue(approvedUser({ sessionVersion: 1 }) as never);

        const result = await requireAuth(requestWithSessionCookie(cookie));

        expect((result as NextResponse).status).toBe(401);
    });

    it('삭제된 계정의 쿠키를 거부한다', async () => {
        findUser.mockResolvedValue(null as never);

        const result = await requireAuth(requestWithSessionCookie(encodeSessionCookie(SESSION)));

        expect((result as NextResponse).status).toBe(401);
    });
});

describe('로그아웃', () => {
    it('세션 쿠키를 만료시킨다', async () => {
        const response = await logout(requestWithSessionCookie());
        const setCookie = response.headers.get('set-cookie');

        expect(response.status).toBe(200);
        expect(setCookie).toContain('session=');
        expect(setCookie).toContain('Max-Age=0');
        expect(setCookie).toContain('Path=/');
        expect(setCookie).toContain('HttpOnly');
        expect(setCookie).toContain('SameSite=strict');
    });
});
