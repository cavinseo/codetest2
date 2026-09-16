// 로그인 라우트가 이용 기간이 만료된 계정을 명확한 문구로 막는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueUser = vi.fn();
const findUniqueProfile = vi.fn();
const resetRateLimit = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findFirst: findUniqueUser },
        memberProfile: { findUnique: findUniqueProfile },
    },
}));

vi.mock('../lib/rate-limit', () => ({
    LOGIN_RATE_LIMIT: {},
    clientIpFrom: () => '127.0.0.1',
    consumeRateLimit: () => ({ allowed: true }),
    resetRateLimit: (...args: unknown[]) => resetRateLimit(...args),
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
    it('이메일 앞뒤 공백과 대소문자를 정규화하되 저장된 초대 기간도 조회한다', async () => {
        const response = await POST(loginRequest({ email: ' U@X.COM ', password: 'password123', role: 'MENTEE' }));
        expect(response.status).toBe(200);
        expect(findUniqueUser).toHaveBeenCalledWith(expect.objectContaining({
            where: { email: { equals: 'u@x.com', mode: 'insensitive' } },
            include: { usedInviteCode: { select: { usedAt: true, expiresAt: true, accessDurationDays: true, programId: true, program: { select: { endsAt: true } } } } },
        }));
    });
    it('관리자가 연장한 초대 계정은 원래 초대 기간 후에도 비밀번호로 로그인한다', async () => {
        findUniqueUser.mockResolvedValue(approvedUser({
            programId: 'program', accessExpiresAt: new Date(Date.now() + 10 * 86_400_000),
            usedInviteCode: {
                programId: 'program', usedAt: new Date(Date.now() - 100 * 86_400_000), accessDurationDays: 90,
                expiresAt: new Date(0), program: { endsAt: new Date(Date.now() + 30 * 86_400_000) },
            },
        }));
        const res = await POST(loginRequest({ email: 'u@x.com', password: 'password123', role: 'MENTEE' }));
        expect(res.status).toBe(200);
        expect(cookieSet).toHaveBeenCalledOnce();
    });

    it('초대 계정은 개인 기한이 남아도 프로그램 종료 후 비밀번호 로그인을 막는다', async () => {
        findUniqueUser.mockResolvedValue(approvedUser({
            programId: 'program', accessExpiresAt: new Date(Date.now() + 86_400_000),
            usedInviteCode: {
                programId: 'program', usedAt: new Date(), accessDurationDays: 90,
                expiresAt: new Date(Date.now() + 86_400_000), program: { endsAt: new Date(0) },
            },
        }));
        const res = await POST(loginRequest({ email: 'u@x.com', password: 'password123', role: 'MENTEE' }));
        expect(res.status).toBe(403);
        expect(cookieSet).not.toHaveBeenCalled();
    });

    it('이용 기간이 지난 계정은 403 으로 막고 쿠키를 심지 않는다', async () => {
        findUniqueUser.mockResolvedValue(approvedUser({
            accessExpiresAt: new Date('2000-01-01T00:00:00Z'),
        }));

        const res = await POST(loginRequest({ email: 'u@x.com', password: 'password123', role: 'MENTEE' }));
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(body.error).toBe('이용 기간이 만료되었습니다. 관리자에게 연장을 요청하세요.');
        expect(cookieSet).not.toHaveBeenCalled();
    });

    it('만료가 없는 계정은 로그인시킨다', async () => {
        const res = await POST(loginRequest({ email: 'u@x.com', password: 'password123', role: 'MENTEE' }));

        expect(res.status).toBe(200);
        expect(cookieSet).toHaveBeenCalled();
    });

    it('만료 시각이 아직 안 지난 계정은 로그인시킨다', async () => {
        findUniqueUser.mockResolvedValue(approvedUser({
            accessExpiresAt: new Date(Date.now() + 86_400_000),
        }));

        const res = await POST(loginRequest({ email: 'u@x.com', password: 'password123', role: 'MENTEE' }));

        expect(res.status).toBe(200);
        expect(cookieSet).toHaveBeenCalled();
    });
});

describe('로그인 선택 역할 확인', () => {
    it.each(['PROGRAM_MANAGER', 'MENTOR', 'MENTEE'] as const)(
        '선택 역할 %s와 DB 역할이 같으면 로그인한다',
        async role => {
            findUniqueUser.mockResolvedValue(approvedUser({ role }));

            const response = await POST(loginRequest({ email: 'u@x.com', password: 'password123', role }));

            expect(response.status).toBe(200);
            expect(cookieSet).toHaveBeenCalledOnce();
            expect(resetRateLimit).toHaveBeenCalledOnce();
        }
    );

    it.each(['MENTOR', 'PROGRAM_MANAGER'] as const)(
        '멘티 계정으로 %s를 선택하면 고정 오류로 거부한다',
        async role => {
            const response = await POST(loginRequest({ email: 'u@x.com', password: 'password123', role }));

            expect(response.status).toBe(403);
            expect(await response.json()).toEqual({
                code: 'LOGIN_ROLE_MISMATCH',
                error: '선택한 로그인 역할과 계정 역할이 일치하지 않습니다. 계정에 맞는 역할을 선택하세요.',
            });
            expect(cookieSet).not.toHaveBeenCalled();
            expect(resetRateLimit).not.toHaveBeenCalled();
        }
    );

    it('비밀번호가 틀리면 선택 역할과 DB 역할이 달라도 자격 증명 오류만 반환한다', async () => {
        compare.mockResolvedValue(false);

        const response = await POST(loginRequest({ email: 'u@x.com', password: 'wrong-password', role: 'MENTOR' }));

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        expect(cookieSet).not.toHaveBeenCalled();
        expect(resetRateLimit).not.toHaveBeenCalled();
    });

    it('일반 회원이 선택 역할을 생략하면 같은 고정 오류로 거부한다', async () => {
        const response = await POST(loginRequest({ email: 'u@x.com', password: 'password123' }));

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'LOGIN_ROLE_MISMATCH' });
        expect(cookieSet).not.toHaveBeenCalled();
        expect(resetRateLimit).not.toHaveBeenCalled();
    });

    it('ADMIN 계정은 관리자 폼처럼 선택 역할을 생략해도 로그인한다', async () => {
        findUniqueUser.mockResolvedValue(approvedUser({ role: 'ADMIN' }));

        const response = await POST(loginRequest({ email: 'u@x.com', password: 'password123' }));

        expect(response.status).toBe(200);
        expect(cookieSet).toHaveBeenCalledOnce();
        expect(resetRateLimit).toHaveBeenCalledOnce();
    });

    it('DB 역할이 올바르지 않으면 멘티로 처리하지 않고 거부한다', async () => {
        findUniqueUser.mockResolvedValue(approvedUser({ role: 'UNKNOWN' }));

        const response = await POST(loginRequest({ email: 'u@x.com', password: 'password123', role: 'MENTEE' }));

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            code: 'ACCOUNT_ROLE_INVALID',
            error: '계정 역할 정보가 올바르지 않습니다. 관리자에게 문의하세요.',
        });
        expect(cookieSet).not.toHaveBeenCalled();
        expect(resetRateLimit).not.toHaveBeenCalled();
    });
});
