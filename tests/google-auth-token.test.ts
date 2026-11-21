// Google Forms 액세스 토큰이 만료되면 저장된 refresh token 으로 갱신하는지 본다.
//
// 예전에는 만료된 토큰을 "연동 안 됨"으로 보고 갱신 함수를 어디서도 부르지 않아,
// 관리자가 연동한 지 1시간이 지나면 설문 생성·응답 가져오기가 매번 재동의를
// 요구했다(감리 B7).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getStoredGoogleToken = vi.fn();
const setGoogleToken = vi.fn();
vi.mock('../lib/service-settings', () => ({
    getGoogleSettings: async () => ({ clientId: 'client-id', clientSecret: 'client-secret', configured: true }),
    getStoredGoogleToken: (...args: unknown[]) => getStoredGoogleToken(...(args as [])),
    setGoogleToken: (...args: unknown[]) => setGoogleToken(...(args as [])),
}));

const logWarn = vi.fn();
vi.mock('../lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: (...args: unknown[]) => logWarn(...args), error: vi.fn() }),
}));

const { getUsableGoogleToken } = await import('../lib/google-auth');

const NOW = 1_800_000_000_000;
const fetchMock = vi.fn();

function tokenResponse(body: unknown, ok = true) {
    return { ok, json: async () => body };
}

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    setGoogleToken.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
});

describe('getUsableGoogleToken', () => {
    it('저장된 토큰이 없으면 갱신을 시도하지 않고 null 이다', async () => {
        getStoredGoogleToken.mockResolvedValue(null);

        expect(await getUsableGoogleToken(NOW)).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('충분히 남은 토큰은 그대로 쓴다', async () => {
        const stored = { accessToken: 'live', refreshToken: 'r', expiresAt: NOW + 10 * 60_000 };
        getStoredGoogleToken.mockResolvedValue(stored);

        expect(await getUsableGoogleToken(NOW)).toBe(stored);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        ['이미 만료된', NOW - 1],
        ['1분 안에 만료될', NOW + 59_000],
    ])('%s 토큰은 refresh token 으로 새로 받아 저장한다', async (_label, expiresAt) => {
        getStoredGoogleToken.mockResolvedValue({ accessToken: 'old', refreshToken: 'refresh-1', expiresAt });
        fetchMock.mockResolvedValue(tokenResponse({ access_token: 'fresh', expires_in: 3600 }));

        const token = await getUsableGoogleToken(NOW);

        const expected = { accessToken: 'fresh', refreshToken: 'refresh-1', expiresAt: NOW + 3_600_000 };
        expect(token).toEqual(expected);
        expect(setGoogleToken).toHaveBeenCalledWith(expected);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://oauth2.googleapis.com/token');
        const body = init.body as URLSearchParams;
        expect(body.get('grant_type')).toBe('refresh_token');
        expect(body.get('refresh_token')).toBe('refresh-1');
        expect(body.get('client_id')).toBe('client-id');
    });

    it('만료 시각이 정확히 1분 남았으면 갱신한다', async () => {
        getStoredGoogleToken.mockResolvedValue({ accessToken: 'old', refreshToken: 'r', expiresAt: NOW + 60_000 });
        fetchMock.mockResolvedValue(tokenResponse({ access_token: 'fresh', expires_in: 3600 }));

        expect((await getUsableGoogleToken(NOW))?.accessToken).toBe('fresh');
    });

    it('refresh token 이 없으면 갱신할 수 없어 null 이다(재연동 안내)', async () => {
        getStoredGoogleToken.mockResolvedValue({ accessToken: 'old', refreshToken: '', expiresAt: NOW - 1 });

        expect(await getUsableGoogleToken(NOW)).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('Google 이 갱신을 거절하면(권한 철회 등) 저장하지 않고 null 이며 토큰 값을 로그에 남기지 않는다', async () => {
        getStoredGoogleToken.mockResolvedValue({ accessToken: 'old-secret', refreshToken: 'refresh-secret', expiresAt: NOW - 1 });
        fetchMock.mockResolvedValue(tokenResponse({ error: 'invalid_grant' }, false));

        expect(await getUsableGoogleToken(NOW)).toBeNull();
        expect(setGoogleToken).not.toHaveBeenCalled();
        expect(logWarn).toHaveBeenCalledOnce();
        expect(JSON.stringify(logWarn.mock.calls)).not.toMatch(/old-secret|refresh-secret/);
    });

    it.each([
        ['access_token 없음', { expires_in: 3600 }],
        ['expires_in 없음', { access_token: 'fresh' }],
    ])('형식이 어긋난 갱신 응답(%s)은 저장하지 않고 null 이다', async (_label, body) => {
        getStoredGoogleToken.mockResolvedValue({ accessToken: 'old', refreshToken: 'r', expiresAt: NOW - 1 });
        fetchMock.mockResolvedValue(tokenResponse(body));

        expect(await getUsableGoogleToken(NOW)).toBeNull();
        expect(setGoogleToken).not.toHaveBeenCalled();
    });

    it('갱신한 토큰을 저장하지 못하면 연동 문제로 숨기지 않고 오류를 던진다', async () => {
        getStoredGoogleToken.mockResolvedValue({ accessToken: 'old', refreshToken: 'r', expiresAt: NOW - 1 });
        fetchMock.mockResolvedValue(tokenResponse({ access_token: 'fresh', expires_in: 3600 }));
        setGoogleToken.mockRejectedValue(new Error('db down'));

        await expect(getUsableGoogleToken(NOW)).rejects.toThrow('db down');
    });
});
