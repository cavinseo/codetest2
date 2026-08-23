// 비밀번호 변경이 로그인한 본인(관리자 아님)에게 열리고 mustChangePassword 를 내리는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findUniqueUser = vi.fn();
const updateUser = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: { user: { findUnique: findUniqueUser, update: updateUser } },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
    encodeSessionCookie: () => 'encoded-cookie',
}));

const cookieSet = vi.fn();
vi.mock('next/headers', () => ({
    cookies: async () => ({ set: cookieSet }),
}));

const compare = vi.fn();
const hash = vi.fn();
vi.mock('bcryptjs', () => ({
    default: {
        compare: (...args: unknown[]) => compare(...args),
        hash: (...args: unknown[]) => hash(...args),
    },
}));

const { POST } = await import('../app/api/admin/password/route');

function authAs(role: string, isAdmin = false) {
    requireAuth.mockResolvedValue({
        userId: 'user_1', email: 'u@x.com', name: '사용자',
        isAdmin, role, accessExpiresAt: null,
    });
}

function jsonRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const validBody = {
    currentPassword: 'oldpassword',
    newPassword: 'newpassword123',
    confirmPassword: 'newpassword123',
};

beforeEach(() => {
    findUniqueUser.mockResolvedValue({ id: 'user_1', passwordHash: 'old-hash' });
    updateUser.mockResolvedValue({ id: 'user_1', email: 'u@x.com', name: '사용자', sessionVersion: 1 });
    compare.mockResolvedValue(true);
    hash.mockResolvedValue('new-hash');
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('본인 비밀번호 변경', () => {
    it('관리자가 아닌 로그인 회원도 본인 비밀번호를 바꿀 수 있다', async () => {
        // 관리자가 만든 멘티가 임시 비밀번호를 스스로 바꿀 수 있어야 한다.
        authAs('MENTEE');

        const res = await POST(jsonRequest(validBody));

        expect(res.status).toBe(200);
        expect(updateUser).toHaveBeenCalled();
    });

    it('비밀번호를 바꾸면 mustChangePassword 를 내린다', async () => {
        authAs('MENTEE');

        await POST(jsonRequest(validBody));

        expect(updateUser.mock.calls[0][0].data.mustChangePassword).toBe(false);
    });

    it('세션의 본인 userId 로만 조회·갱신한다', async () => {
        // 경로에 userId 를 받지 않으므로 남의 계정을 넘겨받을 수 없다.
        authAs('MENTEE');

        await POST(jsonRequest(validBody));

        expect(findUniqueUser.mock.calls[0][0].where.id).toBe('user_1');
        expect(updateUser.mock.calls[0][0].where.id).toBe('user_1');
    });

    it('로그인하지 않았으면 막는다', async () => {
        requireAuth.mockResolvedValue(NextResponse.json({ error: 'Login required.' }, { status: 401 }));

        const res = await POST(jsonRequest(validBody));

        expect(res.status).toBe(401);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('현재 비밀번호가 틀리면 막는다', async () => {
        authAs('MENTEE');
        compare.mockResolvedValue(false);

        const res = await POST(jsonRequest(validBody));

        expect(res.status).toBe(400);
        expect(updateUser).not.toHaveBeenCalled();
    });
});
