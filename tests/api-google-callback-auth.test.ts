// OAuth 콜백이 서명된 nonce 로 관리자가 시작한 흐름인지 확인하는지 본다.
//
// 콜백은 setGoogleToken 으로 서비스 전역 계정을 바꾼다. 쿠키와 state 의 nonce 가
// 같다는 것만으로는 관리자가 시작한 흐름인지 알 수 없다. 공격자가 자기 요청에
// 아무 값이나 쿠키와 state 에 똑같이 넣으면 그 비교는 항상 통과하기 때문이다.
// 서명을 검증해야 우리 서버가 관리자에게 발급한 nonce 인지 알 수 있다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { issueOAuthNonce } from '../lib/oauth-nonce';

const setGoogleToken = vi.fn();
vi.mock('../lib/service-settings', () => ({
    setGoogleToken: (...args: unknown[]) => setGoogleToken(...(args as [])),
}));

const exchangeCodeForToken = vi.fn();
vi.mock('../lib/google-auth', () => ({
    exchangeCodeForToken: (...args: unknown[]) => exchangeCodeForToken(...(args as [])),
}));

// 콜백은 nonce 서명 검증 뒤 DB 로 관리자 여부를 다시 확인한다.
const findUniqueUser = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: (...args: unknown[]) => findUniqueUser(...(args as [])) },
    },
}));

const { GET } = await import('../app/api/auth/google/callback/route');

// 실제 브라우저 조건을 그대로 재현한다: google.com 에서 오는 교차 사이트
// 리디렉트라 session 쿠키는 절대 실리지 않으므로 여기서도 넣지 않는다.
function callbackRequest(nonce: string, cookieNonce: string = nonce): NextRequest {
    const state = encodeURIComponent(JSON.stringify({ returnUrl: '/', projectId: '', nonce }));
    return new NextRequest(`http://localhost/api/auth/google/callback?code=code_1&state=${state}`, {
        headers: { cookie: `google_oauth_nonce=${cookieNonce}` },
    });
}

beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    exchangeCodeForToken.mockResolvedValue({ accessToken: 'tok' });
    setGoogleToken.mockResolvedValue(undefined);
    // 기본은 관리자. 개별 테스트가 비관리자로 재정의한다.
    findUniqueUser.mockResolvedValue({ isAdmin: true });
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

describe('google callback 인증', () => {
    it('서명되지 않은 nonce (예전 취약점과 동일한 위조) 는 거부한다', async () => {
        // 예전 코드가 허용하던 정확한 위조: 공격자가 쿠키와 state 에 같은
        // 값을 넣기만 하면 통과했다. 서명이 없는 순수 UUID 로 재현한다.
        const forged = crypto.randomUUID();

        const res = await GET(callbackRequest(forged));

        expect(res.status).toBe(307);
        expect(res.headers.get('location') ?? '').toContain('error=invalid_state');
        expect(exchangeCodeForToken).not.toHaveBeenCalled();
        expect(setGoogleToken).not.toHaveBeenCalled();
    });

    it('관리자에게 발급된 서명 nonce 는 세션 쿠키 없이도 통과한다', async () => {
        const nonce = issueOAuthNonce('admin_1');

        const res = await GET(callbackRequest(nonce));

        expect(setGoogleToken).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(307);
        expect(res.headers.get('location') ?? '').not.toContain('error=');
    });

    it('서명은 유효하지만 DB 상 관리자가 아니면 서비스 계정을 바꾸지 않는다', async () => {
        // start 라우트의 requireAdmin 은 교차 사이트 콜백에 실리지 않는다. nonce
        // 서명이 유효해도 콜백이 관리자 여부를 다시 보지 않으면, 비관리자가 자기
        // nonce 로 서비스 Google 계정을 탈취할 수 있다.
        const nonce = issueOAuthNonce('mentee_42');
        findUniqueUser.mockResolvedValue({ isAdmin: false });

        const res = await GET(callbackRequest(nonce));

        expect(res.status).toBe(307);
        expect(res.headers.get('location') ?? '').toContain('error=invalid_state');
        expect(exchangeCodeForToken).not.toHaveBeenCalled();
        expect(setGoogleToken).not.toHaveBeenCalled();
    });

    it('서명이 변조된 nonce 는 거부한다', async () => {
        const nonce = issueOAuthNonce('admin_1');
        const [payload, signature] = nonce.split('.');
        // 길이는 그대로 두고 한 글자만 바꿔, 길이 불일치가 아니라 서명
        // 비교 자체가 실패하는 경로를 검증한다.
        const flippedChar = signature[0] === 'a' ? 'b' : 'a';
        const tampered = `${payload}.${flippedChar}${signature.slice(1)}`;

        const res = await GET(callbackRequest(tampered));

        expect(res.status).toBe(307);
        expect(res.headers.get('location') ?? '').toContain('error=invalid_state');
        expect(exchangeCodeForToken).not.toHaveBeenCalled();
        expect(setGoogleToken).not.toHaveBeenCalled();
    });
});
