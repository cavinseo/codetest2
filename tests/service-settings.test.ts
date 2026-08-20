// 서비스 설정이 DB 에 암호화되어 저장되고, 부분 저장이 기존 시크릿을 지우지 않는지 본다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rows = new Map<string, string>();

const findUnique = vi.fn(async ({ where }: { where: { key: string } }) => {
    const value = rows.get(where.key);
    return value === undefined ? null : { key: where.key, value, updatedAt: new Date() };
});
const upsert = vi.fn(async ({ where, create, update }: {
    where: { key: string };
    create: { key: string; value: string };
    update: { value: string };
}) => {
    rows.set(where.key, rows.has(where.key) ? update.value : create.value);
    return { key: where.key, value: rows.get(where.key)!, updatedAt: new Date() };
});

vi.mock('../lib/prisma', () => ({
    prisma: { serviceSetting: { findUnique, upsert } },
}));

const {
    getAiSettings,
    getGoogleSettings,
    getGoogleToken,
    getSmtpSettings,
    setGoogleToken,
    updateAiSettings,
    updateGoogleSettings,
    updateSmtpSettings,
} = await import('../lib/service-settings');
const { resetSettingsKeyCache } = await import('../lib/settings-crypto');

beforeEach(() => {
    rows.clear();
    vi.stubEnv('SETTINGS_ENCRYPTION_KEY', 'test-settings-key');
    resetSettingsKeyCache();
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    resetSettingsKeyCache();
});

describe('Google 설정', () => {
    it('저장한 값을 되돌려 준다', async () => {
        await updateGoogleSettings({ clientId: 'id-123', clientSecret: 'secret-abc' });

        const google = await getGoogleSettings();

        expect(google).toEqual({ clientId: 'id-123', clientSecret: 'secret-abc', configured: true });
    });

    it('DB 에 평문으로 저장하지 않는다', async () => {
        await updateGoogleSettings({ clientId: 'id-123', clientSecret: 'secret-abc' });

        const stored = rows.get('google')!;

        expect(stored).not.toContain('secret-abc');
        expect(stored.startsWith('enc:v1:')).toBe(true);
    });

    it('빈 값으로 저장해도 기존 시크릿이 지워지지 않는다', async () => {
        await updateGoogleSettings({ clientId: 'id-123', clientSecret: 'secret-abc' });

        // 화면에서 clientId 만 바꿔 보낸 상황. 예전에는 secret 이 '' 로 덮여 사라졌다.
        await updateGoogleSettings({ clientId: 'id-456', clientSecret: '' });

        const google = await getGoogleSettings();
        expect(google.clientId).toBe('id-456');
        expect(google.clientSecret).toBe('secret-abc');
    });

    it('둘 중 하나만 있으면 configured 가 아니다', async () => {
        await updateGoogleSettings({ clientId: 'only-id' });

        expect((await getGoogleSettings()).configured).toBe(false);
    });

    it('저장 전에는 빈 설정을 돌려준다', async () => {
        expect(await getGoogleSettings()).toEqual({ clientId: '', clientSecret: '', configured: false });
    });
});

describe('SMTP 설정', () => {
    it('비밀번호를 평문으로 저장하지 않는다', async () => {
        await updateSmtpSettings({ host: 'smtp.example.com', port: 587, user: 'me@x.com', pass: 'p@ss' });

        expect(rows.get('smtp')).not.toContain('p@ss');
        expect((await getSmtpSettings()).pass).toBe('p@ss');
    });

    it('부분 저장이 비밀번호를 지우지 않는다', async () => {
        await updateSmtpSettings({ host: 'smtp.example.com', port: 587, user: 'me@x.com', pass: 'p@ss' });

        await updateSmtpSettings({ host: 'smtp2.example.com' });

        const smtp = await getSmtpSettings();
        expect(smtp.host).toBe('smtp2.example.com');
        expect(smtp.pass).toBe('p@ss');
        expect(smtp.user).toBe('me@x.com');
    });
});

describe('AI 설정', () => {
    it('저장된 값이 없으면 환경변수 기본값을 쓴다', async () => {
        vi.stubEnv('AI_PROVIDER', 'local');
        vi.stubEnv('AI_LOCAL_MODEL', 'llama3');

        const ai = await getAiSettings();

        expect(ai.provider).toBe('local');
        expect(ai.localModel).toBe('llama3');
    });

    it('일부만 저장돼 있어도 나머지는 기본값으로 메운다', async () => {
        await updateAiSettings({ provider: 'hermes' });

        const ai = await getAiSettings();

        expect(ai.provider).toBe('hermes');
        expect(ai.localBaseUrl).toBeTruthy();
        expect(ai.hermesModel).toBeTruthy();
    });
});

describe('Google 토큰', () => {
    it('만료 전 토큰은 돌려주고, 만료된 것은 돌려주지 않는다', async () => {
        await setGoogleToken({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000 });
        expect((await getGoogleToken())?.accessToken).toBe('a');

        await setGoogleToken({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() - 1 });
        expect(await getGoogleToken()).toBeNull();
    });

    it('refresh token 을 평문으로 저장하지 않는다', async () => {
        await setGoogleToken({ accessToken: 'a', refreshToken: 'refresh-xyz', expiresAt: Date.now() + 60_000 });

        expect(rows.get('google-token')).not.toContain('refresh-xyz');
    });
});

describe('복호화 실패', () => {
    it('키가 바뀌면 미설정으로 취급하고 예외를 던지지 않는다', async () => {
        await updateGoogleSettings({ clientId: 'id', clientSecret: 'secret' });

        vi.stubEnv('SETTINGS_ENCRYPTION_KEY', 'rotated-key');
        resetSettingsKeyCache();

        await expect(getGoogleSettings()).resolves.toEqual({
            clientId: '', clientSecret: '', configured: false,
        });
    });
});
