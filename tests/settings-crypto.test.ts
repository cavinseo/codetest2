import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    decryptSettingsValue,
    encryptSettingsValue,
    resetSettingsKeyCache,
} from '../lib/settings-crypto';

beforeEach(() => {
    vi.stubEnv('SETTINGS_ENCRYPTION_KEY', 'test-settings-key');
    resetSettingsKeyCache();
});

afterEach(() => {
    vi.unstubAllEnvs();
    resetSettingsKeyCache();
});

describe('settings 암호화', () => {
    it('암호화한 값을 그대로 되돌린다', () => {
        const secret = 'GOCSPX-super-secret-value';

        expect(decryptSettingsValue(encryptSettingsValue(secret))).toBe(secret);
    });

    it('저장된 문자열에 평문이 남지 않는다', () => {
        const encrypted = encryptSettingsValue('my-smtp-password');

        expect(encrypted).not.toContain('my-smtp-password');
        expect(encrypted.startsWith('enc:v1:')).toBe(true);
    });

    it('같은 값을 두 번 암호화해도 결과가 다르다', () => {
        // IV 가 매번 새로 생성되므로 같은 평문이라도 저장값이 달라야 한다.
        expect(encryptSettingsValue('same')).not.toBe(encryptSettingsValue('same'));
    });

    it('한글과 긴 JSON 도 왕복한다', () => {
        const payload = JSON.stringify({ host: 'smtp.example.com', 메모: '한글 설정 값', port: 587 });

        expect(decryptSettingsValue(encryptSettingsValue(payload))).toBe(payload);
    });

    it('변조된 값은 복호화되지 않는다', () => {
        const encrypted = encryptSettingsValue('original');
        const body = encrypted.slice('enc:v1:'.length);
        const tampered = 'enc:v1:' + Buffer.from(
            Buffer.from(body, 'base64').map((byte, index) => (index === 30 ? byte ^ 0xff : byte))
        ).toString('base64');

        expect(decryptSettingsValue(tampered)).toBeNull();
    });

    it('키가 바뀌면 null 을 돌려준다 (서비스는 멈추지 않는다)', () => {
        const encrypted = encryptSettingsValue('secret');

        vi.stubEnv('SETTINGS_ENCRYPTION_KEY', 'a-different-key');
        resetSettingsKeyCache();

        expect(decryptSettingsValue(encrypted)).toBeNull();
    });

    it('접두사가 없는 값은 null', () => {
        expect(decryptSettingsValue('plain-text')).toBeNull();
        expect(decryptSettingsValue('')).toBeNull();
    });

    it('전용 키가 없으면 SESSION_SECRET 에서 파생한다', () => {
        vi.stubEnv('SETTINGS_ENCRYPTION_KEY', '');
        vi.stubEnv('SESSION_SECRET', 'fallback-session-secret');
        resetSettingsKeyCache();

        expect(decryptSettingsValue(encryptSettingsValue('via-session'))).toBe('via-session');
    });

    it('키 재료가 하나도 없으면 실패한다', () => {
        vi.stubEnv('SETTINGS_ENCRYPTION_KEY', '');
        vi.stubEnv('SESSION_SECRET', '');
        vi.stubEnv('NEXTAUTH_SECRET', '');
        resetSettingsKeyCache();

        expect(() => encryptSettingsValue('x')).toThrow(/SETTINGS_ENCRYPTION_KEY/);
    });
});
