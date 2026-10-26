// 세션 쿠키를 굽는 곳과 지우는 곳이 같은 옵션을 쓰는지 확인한다(2026-10-25 코드 리뷰 D5).
import { afterEach, expect, it, vi } from 'vitest';

const encodeSessionCookie = vi.fn(() => 'signed-cookie');
vi.mock('../lib/auth', () => ({ encodeSessionCookie: (...args: unknown[]) => encodeSessionCookie(...(args as [])) }));

const { clearSessionCookie, sessionCookieOptions, setSessionCookie } = await import('../lib/session-cookie');
const { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } = await import('../lib/constants');

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
});

const user = { userId: 'user_1', email: 'member@example.com', name: '회원' };

it('세션 버전을 서명에 넣어 httpOnly·strict 쿠키로 굽는다', () => {
    const set = vi.fn();

    setSessionCookie({ set }, user, 3);

    expect(encodeSessionCookie).toHaveBeenCalledWith(user, { sessionVersion: 3 });
    expect(set).toHaveBeenCalledWith(SESSION_COOKIE_NAME, 'signed-cookie', {
        httpOnly: true, sameSite: 'strict', secure: false, maxAge: SESSION_MAX_AGE_SECONDS, path: '/',
    });
});

it('지울 때는 같은 옵션에 만료 0 으로 빈 값을 넣는다', () => {
    const set = vi.fn();

    clearSessionCookie({ set });

    expect(set).toHaveBeenCalledWith(SESSION_COOKIE_NAME, '', {
        httpOnly: true, sameSite: 'strict', secure: false, maxAge: 0, path: '/',
    });
    expect(encodeSessionCookie).not.toHaveBeenCalled();
});

it('운영에서는 secure 쿠키로 굽는다', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(sessionCookieOptions().secure).toBe(true);
});
