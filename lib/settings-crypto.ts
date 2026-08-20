// 서비스 설정에 담기는 시크릿(Google client secret, SMTP 비밀번호, OAuth 토큰)을
// DB 에 평문으로 두지 않기 위한 대칭 암호화.
//
// AES-256-GCM 을 쓴다. 인증 태그가 붙어 변조된 값은 복호화 단계에서 걸린다.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX = 'enc:v1:';

// scrypt 는 호출 비용이 있어 파생 키를 한 번만 만들어 재사용한다.
let cachedKey: { source: string; key: Buffer } | null = null;

function keySourceMaterial(): string {
    // 전용 키를 우선한다. 없으면 세션 시크릿에서 파생한다.
    // 후자의 경우 SESSION_SECRET 을 교체하면 저장된 설정을 복호화할 수 없게 되므로,
    // 운영에서는 SETTINGS_ENCRYPTION_KEY 를 따로 두는 편이 좋다.
    const material = process.env.SETTINGS_ENCRYPTION_KEY
        || process.env.SESSION_SECRET
        || process.env.NEXTAUTH_SECRET;
    if (!material) {
        throw new Error('SETTINGS_ENCRYPTION_KEY 또는 SESSION_SECRET 환경변수가 필요합니다.');
    }
    return material;
}

function derivedKey(): Buffer {
    const source = keySourceMaterial();
    if (cachedKey?.source === source) return cachedKey.key;

    const key = scryptSync(source, 'ks-qfd-service-settings', 32);
    cachedKey = { source, key };
    return key;
}

export function encryptSettingsValue(plainText: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, derivedKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * 복호화한다. 키가 바뀌었거나 값이 손상돼 읽을 수 없으면 null 을 돌려준다.
 * 설정을 못 읽는 것이 서비스 전체를 멈출 이유는 아니므로, 호출부는 "미설정"으로
 * 취급하고 넘어가면 된다.
 */
export function decryptSettingsValue(stored: string): string | null {
    if (!stored.startsWith(PREFIX)) return null;

    try {
        const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
        const iv = raw.subarray(0, IV_BYTES);
        const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
        const payload = raw.subarray(IV_BYTES + TAG_BYTES);

        const decipher = createDecipheriv(ALGORITHM, derivedKey(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
}

/** 테스트에서 키 캐시를 비우기 위한 용도. */
export function resetSettingsKeyCache(): void {
    cachedKey = null;
}
