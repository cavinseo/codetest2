// Google 회원 로그인 URL과 code 교환이 최소 권한과 응답 검증을 지키는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getGoogleSettings = vi.fn();
vi.mock('../lib/service-settings', () => ({
    getGoogleSettings: (...args: unknown[]) => getGoogleSettings(...(args as [])),
}));

const { exchangeLoginCodeForEmail, getGoogleLoginAuthUrl } = await import('../lib/google-auth');

const fetchMock = vi.fn();

function idToken(claims: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' }), 'utf8').toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    return `${header}.${payload}.signature`;
}

function tokenResponse(body: Record<string, unknown>, status: number = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    getGoogleSettings.mockResolvedValue({
        clientId: 'client-id',
        clientSecret: 'client-secret',
    });
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe('Google 회원 로그인 인증 헬퍼', () => {
    it('로그인 URL에 신원 확인 스코프, 계정 선택, state만 구성한다', async () => {
        const url = new URL(await getGoogleLoginAuthUrl(
            'https://app.example.com/api/auth/google/login/callback',
            'signed-state'
        ));

        expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
        expect(url.searchParams.get('client_id')).toBe('client-id');
        expect(url.searchParams.get('redirect_uri')).toBe(
            'https://app.example.com/api/auth/google/login/callback'
        );
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('scope')).toBe('openid email');
        expect(url.searchParams.get('prompt')).toBe('select_account');
        expect(url.searchParams.get('state')).toBe('signed-state');
        expect(url.searchParams.get('scope')).not.toContain('forms');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('code를 교환해 email과 verified를 반환한다', async () => {
        fetchMock.mockResolvedValue(tokenResponse({
            id_token: idToken({ email: 'member@example.com', email_verified: true }),
        }));

        await expect(exchangeLoginCodeForEmail(
            'google-code',
            'https://app.example.com/api/auth/google/login/callback'
        )).resolves.toEqual({ email: 'member@example.com', verified: true });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://oauth2.googleapis.com/token');
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
        const body = init.body as URLSearchParams;
        expect(Object.fromEntries(body.entries())).toEqual({
            code: 'google-code',
            client_id: 'client-id',
            client_secret: 'client-secret',
            redirect_uri: 'https://app.example.com/api/auth/google/login/callback',
            grant_type: 'authorization_code',
        });
    });

    it('id_token이 없으면 거부한다', async () => {
        fetchMock.mockResolvedValue(tokenResponse({}));

        await expect(exchangeLoginCodeForEmail('code', 'https://app.example.com/callback'))
            .rejects.toThrow('id_token 이 없습니다.');
    });

    it('id_token 형식이 세 부분이 아니면 거부한다', async () => {
        fetchMock.mockResolvedValue(tokenResponse({ id_token: 'invalid.token' }));

        await expect(exchangeLoginCodeForEmail('code', 'https://app.example.com/callback'))
            .rejects.toThrow('id_token 형식이 올바르지 않습니다.');
    });

    it('id_token에 email이 없으면 거부한다', async () => {
        fetchMock.mockResolvedValue(tokenResponse({
            id_token: idToken({ email_verified: true }),
        }));

        await expect(exchangeLoginCodeForEmail('code', 'https://app.example.com/callback'))
            .rejects.toThrow('이메일 정보를 받지 못했습니다.');
    });

    it('Google token endpoint가 실패하면 거부한다', async () => {
        fetchMock.mockResolvedValue(tokenResponse({ error: 'invalid_grant' }, 400));

        await expect(exchangeLoginCodeForEmail('code', 'https://app.example.com/callback'))
            .rejects.toThrow('Google 코드 교환에 실패했습니다.');
    });
});
