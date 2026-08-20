// OAuth 콜백이 서비스 Google 토큰을 저장하기 전에 관리자인지 확인하는지 본다.
//
// 콜백은 setGoogleToken 으로 서비스 전역 계정을 바꾼다. nonce 검증만으로는
// 직접 호출을 막지 못한다. 공격자는 자기 요청에 쿠키와 state 를 모두 세팅할
// 수 있기 때문이다. 그러면 공격자의 Google 계정으로 서비스가 바뀐다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const setGoogleToken = vi.fn();
vi.mock('../lib/service-settings', () => ({
    setGoogleToken: (...args: unknown[]) => setGoogleToken(...(args as [])),
}));

const exchangeCodeForToken = vi.fn();
vi.mock('../lib/google-auth', () => ({
    exchangeCodeForToken: (...args: unknown[]) => exchangeCodeForToken(...(args as [])),
}));

const requireAdmin = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireAdmin: (...args: unknown[]) => requireAdmin(...(args as [])),
}));

const { GET } = await import('../app/api/auth/google/callback/route');

const NONCE = 'nonce_abc';

function callbackRequest(): NextRequest {
    const state = encodeURIComponent(JSON.stringify({ returnUrl: '/', projectId: '', nonce: NONCE }));
    const req = new NextRequest(`http://localhost/api/auth/google/callback?code=code_1&state=${state}`, {
        headers: { cookie: `google_oauth_nonce=${NONCE}` },
    });
    return req;
}

beforeEach(() => {
    requireAdmin.mockResolvedValue({ userId: 'admin_1', email: 'admin@ks-qfd.com', name: '관리자' });
    exchangeCodeForToken.mockResolvedValue({ accessToken: 'tok' });
    setGoogleToken.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('google callback 인증', () => {
    it('관리자가 아니면 토큰을 저장하지 않는다', async () => {
        requireAdmin.mockResolvedValue(
            NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
        );

        const res = await GET(callbackRequest());

        expect(res.status).toBe(403);
        expect(setGoogleToken).not.toHaveBeenCalled();
        expect(exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it('관리자면 토큰을 저장한다', async () => {
        const res = await GET(callbackRequest());

        expect(setGoogleToken).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(307);
    });
});
