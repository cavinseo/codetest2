// 로그아웃이 이미 발급된 세션까지 끊는지 확인한다.
//
// 예전에는 클라이언트 쿠키만 지웠다. 그래서 쿠키가 유출·탈취된 경우
// 사용자가 로그아웃해도 만료 시각까지 그 쿠키가 계속 통했다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const updateUser = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: { user: { update: updateUser } },
}));

const getSessionUser = vi.fn();
vi.mock('../lib/auth', () => ({
    getSessionUser: (...args: unknown[]) => getSessionUser(...(args as [])),
}));

const { POST } = await import('../app/api/auth/logout/route');

function logoutRequest(): NextRequest {
    return new NextRequest('http://localhost/api/auth/logout', { method: 'POST' });
}

beforeEach(() => {
    getSessionUser.mockReturnValue({ userId: 'user_7', email: 'u@x.com', name: '사용자' });
    updateUser.mockResolvedValue({ id: 'user_7' });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('logout', () => {
    it('sessionVersion 을 올려 발급된 세션을 끊는다', async () => {
        const res = await POST(logoutRequest());

        expect(res.status).toBe(200);
        expect(updateUser).toHaveBeenCalledWith({
            where: { id: 'user_7' },
            data: { sessionVersion: { increment: 1 } },
        });
    });

    it('쿠키를 만료시킨다', async () => {
        const res = await POST(logoutRequest());

        expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    });

    it('세션이 없어도 200 으로 끝낸다', async () => {
        getSessionUser.mockReturnValue(null);

        const res = await POST(logoutRequest());

        expect(res.status).toBe(200);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('DB 갱신이 실패해도 쿠키는 지우고 200 을 준다', async () => {
        // 로그아웃이 서버 오류로 실패하면 사용자는 로그인 상태로 남는다.
        // 최소한 이 브라우저에서는 나가지도록 쿠키는 반드시 지운다.
        updateUser.mockRejectedValue(new Error('db down'));

        const res = await POST(logoutRequest());

        expect(res.status).toBe(200);
        expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    });
});
