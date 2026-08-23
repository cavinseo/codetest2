// 로그인 라우트가 이용 기간이 만료된 계정을 명확한 문구로 막는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueUser = vi.fn();
const findUniqueProfile = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUniqueUser },
        memberProfile: { findUnique: findUniqueProfile },
    },
}));

vi.mock('../lib/rate-limit', () => ({
    LOGIN_RATE_LIMIT: {},
    clientIpFrom: () => '127.0.0.1',
    consumeRateLimit: () => ({ allowed: true }),
    resetRateLimit: () => {},
}));

const cookieSet = vi.fn();
vi.mock('next/headers', () => ({
    cookies: async () => ({ set: cookieSet }),
}));

vi.mock('../lib/auth', () => ({
    encodeSessionCookie: () => 'encoded-cookie',
}));

const compare = vi.fn();
vi.mock('bcryptjs', () => ({
    default: {
        hashSync: () => 'dummy-hash',
        compare: (...args: unknown[]) => compare(...args),
    },
}));

const { POST } = await import('../app/api/auth/login/route');

function loginRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function approvedUser(overrides: Record<string, unknown> = {}) {
    return {
        id: 'user_1', email: 'u@x.com', name: '사용자',
        passwordHash: 'hash', status: 'APPROVED', sessionVersion: 0,
        role: 'MENTEE', mustChangePassword: false, accessExpiresAt: null,
        ...overrides,
    };
}

beforeEach(() => {
    findUniqueUser.mockResolvedValue(approvedUser());
    findUniqueProfile.mockResolvedValue(null);
    compare.mockResolvedValue(true);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('로그인 이용 기간 확인', () => {
    it('이용 기간이 지난 계정은 403 으로 막고 쿠키를 심지 않는다', async () => {
        findUniqueUser.mockResolvedValue(approvedUser({
            accessExpiresAt: new Date('2000-01-01T00:00:00Z'),
        }));

        const res = await POST(loginRequest({ email: 'u@x.com', password: 'password123' }));
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(body.error).toBe('이용 기간이 만료되었습니다. 관리자에게 연장을 요청하세요.');
        expect(cookieSet).not.toHaveBeenCalled();
    });

    it('만료가 없는 계정은 로그인시킨다', async () => {
        const res = await POST(loginRequest({ email: 'u@x.com', password: 'password123' }));

        expect(res.status).toBe(200);
        expect(cookieSet).toHaveBeenCalled();
    });

    it('만료 시각이 아직 안 지난 계정은 로그인시킨다', async () => {
        findUniqueUser.mockResolvedValue(approvedUser({
            accessExpiresAt: new Date(Date.now() + 86_400_000),
        }));

        const res = await POST(loginRequest({ email: 'u@x.com', password: 'password123' }));

        expect(res.status).toBe(200);
        expect(cookieSet).toHaveBeenCalled();
    });
});
