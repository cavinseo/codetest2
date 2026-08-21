// OAuth 시작 라우트가 관리자 게이트를 지키고, 서명된 nonce 를 실제로 발급하는지 본다.
//
// 이 라우트는 issueOAuthNonce 를 부르는 유일한 지점이다. 콜백 쪽(검증)에는
// 테스트가 있었지만 발급 쪽은 한 번도 실행된 적이 없었다 — 관리자가 아닌
// 요청이 걸러지는지, 쿠키에 실리는 값이 정말 검증 가능한 서명인지, projectId 와
// returnUrl 이 state 에 그대로 실리는지 전부 무테스트였다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOAuthNonce } from '../lib/oauth-nonce';

const requireAdmin = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireAdmin: (...args: unknown[]) => requireAdmin(...(args as [])),
}));

const isGoogleConfigured = vi.fn();
vi.mock('../lib/service-settings', () => ({
    isGoogleConfigured: () => isGoogleConfigured(),
}));

const getGoogleAuthUrl = vi.fn();
vi.mock('../lib/google-auth', () => ({
    getGoogleAuthUrl: (...args: unknown[]) => getGoogleAuthUrl(...(args as [])),
}));

const { GET } = await import('../app/api/auth/google/route');

const ADMIN = { userId: 'admin_1', email: 'admin@ks-qfd.com', name: '관리자' };

function startRequest(query: string = ''): NextRequest {
    return new NextRequest(`http://localhost/api/auth/google${query}`);
}

beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    requireAdmin.mockResolvedValue(ADMIN);
    isGoogleConfigured.mockResolvedValue(true);
    getGoogleAuthUrl.mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

describe('google 시작 라우트', () => {
    it('관리자가 아니면 nonce 를 발급하지 않고 그대로 막는다', async () => {
        requireAdmin.mockResolvedValue(
            NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
        );

        const res = await GET(startRequest());

        expect(res.status).toBe(403);
        expect(getGoogleAuthUrl).not.toHaveBeenCalled();
        expect(res.headers.get('set-cookie')).toBeNull();
    });

    it('Google 이 설정되지 않았으면 400 이고 nonce 를 발급하지 않는다', async () => {
        isGoogleConfigured.mockResolvedValue(false);

        const res = await GET(startRequest());
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toContain('설정되지 않았습니다');
        expect(getGoogleAuthUrl).not.toHaveBeenCalled();
        expect(res.headers.get('set-cookie')).toBeNull();
    });

    it('관리자면 검증 가능한 서명 nonce 를 쿠키에 실어 리디렉트한다', async () => {
        const res = await GET(startRequest());

        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1');

        const setCookie = res.headers.get('set-cookie') ?? '';
        expect(setCookie).toContain('google_oauth_nonce=');
        expect(setCookie).toContain('HttpOnly');
        expect(setCookie.toLowerCase()).toContain('samesite=lax');
        expect(setCookie).toContain('Path=/api/auth/google/callback');

        // 쿠키에 실린 값이 정말 이 관리자에게 서명된 nonce 인지 콜백과 같은
        // 방식으로 검증한다. 형태만 맞는 값이 아니라 실제로 통과해야 한다.
        const nonce = /google_oauth_nonce=([^;]+)/.exec(setCookie)?.[1];
        const verified = verifyOAuthNonce(nonce);
        expect(verified?.userId).toBe('admin_1');
    });

    it('발급되는 nonce 마다 값이 다르다', async () => {
        const res1 = await GET(startRequest());
        const res2 = await GET(startRequest());

        const nonce1 = /google_oauth_nonce=([^;]+)/.exec(res1.headers.get('set-cookie') ?? '')?.[1];
        const nonce2 = /google_oauth_nonce=([^;]+)/.exec(res2.headers.get('set-cookie') ?? '')?.[1];

        expect(nonce1).not.toBe(nonce2);
    });

    it('projectId 와 안전한 returnUrl 을 state 에 그대로 담아 전달한다', async () => {
        await GET(startRequest('?returnUrl=%2Fproject%2Fabc&projectId=proj_9'));

        expect(getGoogleAuthUrl).toHaveBeenCalledTimes(1);
        const [, state] = getGoogleAuthUrl.mock.calls[0];
        const parsed = JSON.parse(state);

        expect(parsed.returnUrl).toBe('/project/abc');
        expect(parsed.projectId).toBe('proj_9');
        expect(typeof parsed.nonce).toBe('string');
    });

    it('오픈 리디렉트 형태의 returnUrl 은 안전한 값으로 대체된다', async () => {
        // safeReturnUrl 과의 연결점 자체가 이 라우트에서만 쓰인다.
        // 여기가 무테스트면 그 연결이 끊겨도 아무도 모른다.
        await GET(startRequest('?returnUrl=%2F%2Fevil.com'));

        const [, state] = getGoogleAuthUrl.mock.calls[0];
        expect(JSON.parse(state).returnUrl).toBe('/');
    });
});
