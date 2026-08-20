// 서비스 전역 설정(Google OAuth, SMTP, AI 엔진) 저장소.
//
// 예전에는 globalThis 메모리에만 두었다. Vercel 서버리스에서는 인스턴스마다 값이
// 다르고 콜드스타트마다 사라져, 관리자가 저장한 Google/SMTP 자격증명이 다음 요청에
// 없어지는 상태였다. 이제 DB(ServiceSetting)에 암호화해 저장한다.
//
// 접근자가 async 인 이유가 여기에 있다. 호출부는 await 해야 한다.
import { prisma } from './prisma';
import { createLogger } from './logger';
import { decryptSettingsValue, encryptSettingsValue } from './settings-crypto';

const log = createLogger('lib/service-settings');

export interface GoogleSettings {
    clientId: string;
    clientSecret: string;
    configured: boolean;
}

export interface SmtpSettings {
    host: string;
    port: number;
    user: string;
    pass: string;
    configured: boolean;
}

// AI 엔진 설정. 환경 변수를 기본값으로 두고, 실행 중에 화면에서 바꿀 수 있다.
export interface AiSettings {
    provider: 'rule' | 'local' | 'hermes' | 'api';
    localBaseUrl: string;
    localModel: string;
    hermesBaseUrl: string;
    hermesModel: string;
}

export interface GoogleToken {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

const KEYS = {
    google: 'google',
    smtp: 'smtp',
    ai: 'ai',
    googleToken: 'google-token',
} as const;

export function parseAiProvider(value: string | undefined): AiSettings['provider'] {
    return value === 'local' || value === 'hermes' || value === 'api' ? value : 'rule';
}

function aiDefaults(): AiSettings {
    return {
        provider: parseAiProvider(process.env.AI_PROVIDER),
        localBaseUrl: process.env.AI_LOCAL_BASE_URL || 'http://localhost:11434/v1',
        localModel: process.env.AI_LOCAL_MODEL || 'qwen2.5:7b',
        hermesBaseUrl: process.env.HERMES_BASE_URL || 'http://localhost:8080/v1',
        hermesModel: process.env.HERMES_MODEL || 'hermes',
    };
}

const EMPTY_GOOGLE: GoogleSettings = { clientId: '', clientSecret: '', configured: false };
const EMPTY_SMTP: SmtpSettings = { host: '', port: 587, user: '', pass: '', configured: false };

// ─── 저장소 접근 ────────────────────────────────────────────────

async function readSetting<T>(key: string): Promise<T | null> {
    try {
        const row = await prisma.serviceSetting.findUnique({ where: { key } });
        if (!row) return null;

        const plain = decryptSettingsValue(row.value);
        if (plain === null) {
            // 키가 바뀌었거나 값이 손상됐다. 서비스를 멈출 이유는 아니므로 미설정으로 본다.
            log.warn('서비스 설정을 복호화하지 못해 미설정으로 처리합니다.', { key });
            return null;
        }
        return JSON.parse(plain) as T;
    } catch (error) {
        log.error('서비스 설정 조회 실패', error, { key });
        return null;
    }
}

async function writeSetting(key: string, value: unknown): Promise<void> {
    const encrypted = encryptSettingsValue(JSON.stringify(value));
    await prisma.serviceSetting.upsert({
        where: { key },
        create: { key, value: encrypted },
        update: { value: encrypted },
    });
}

// ─── Google OAuth ───────────────────────────────────────────────

export async function getGoogleSettings(): Promise<GoogleSettings> {
    const stored = await readSetting<Partial<GoogleSettings>>(KEYS.google);
    if (!stored) return { ...EMPTY_GOOGLE };

    const clientId = stored.clientId ?? '';
    const clientSecret = stored.clientSecret ?? '';
    return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

/**
 * 빈 문자열은 "바꾸지 않음"으로 본다.
 * 예전에는 부분 payload 로 저장된 시크릿이 통째로 지워졌다.
 */
export async function updateGoogleSettings(patch: { clientId?: string; clientSecret?: string }): Promise<GoogleSettings> {
    const current = await getGoogleSettings();
    const next: GoogleSettings = {
        clientId: patch.clientId?.trim() || current.clientId,
        clientSecret: patch.clientSecret?.trim() || current.clientSecret,
        configured: false,
    };
    next.configured = Boolean(next.clientId && next.clientSecret);

    await writeSetting(KEYS.google, next);
    return next;
}

export async function isGoogleConfigured(): Promise<boolean> {
    return (await getGoogleSettings()).configured;
}

// ─── SMTP ───────────────────────────────────────────────────────

export async function getSmtpSettings(): Promise<SmtpSettings> {
    const stored = await readSetting<Partial<SmtpSettings>>(KEYS.smtp);
    if (!stored) return { ...EMPTY_SMTP };

    const host = stored.host ?? '';
    const user = stored.user ?? '';
    const pass = stored.pass ?? '';
    return {
        host,
        port: typeof stored.port === 'number' ? stored.port : 587,
        user,
        pass,
        configured: Boolean(host && user && pass),
    };
}

export async function updateSmtpSettings(
    patch: { host?: string; port?: number; user?: string; pass?: string }
): Promise<SmtpSettings> {
    const current = await getSmtpSettings();
    const next: SmtpSettings = {
        host: patch.host?.trim() || current.host,
        port: typeof patch.port === 'number' && patch.port > 0 ? patch.port : current.port,
        user: patch.user?.trim() || current.user,
        pass: patch.pass?.trim() || current.pass,
        configured: false,
    };
    next.configured = Boolean(next.host && next.user && next.pass);

    await writeSetting(KEYS.smtp, next);
    return next;
}

export async function isSmtpConfigured(): Promise<boolean> {
    return (await getSmtpSettings()).configured;
}

// ─── AI 엔진 ────────────────────────────────────────────────────

export async function getAiSettings(): Promise<AiSettings> {
    const stored = await readSetting<Partial<AiSettings>>(KEYS.ai);
    // 저장된 값이 없거나 일부만 있으면 환경변수 기본값으로 메운다.
    return { ...aiDefaults(), ...(stored ?? {}) };
}

export async function updateAiSettings(patch: Partial<AiSettings>): Promise<AiSettings> {
    const next = { ...(await getAiSettings()), ...patch };
    await writeSetting(KEYS.ai, next);
    return next;
}

// ─── Google 토큰 ────────────────────────────────────────────────

export async function setGoogleToken(token: GoogleToken): Promise<void> {
    await writeSetting(KEYS.googleToken, token);
}

export async function getGoogleToken(): Promise<GoogleToken | null> {
    const token = await readSetting<GoogleToken>(KEYS.googleToken);
    if (!token) return null;
    if (typeof token.expiresAt !== 'number' || token.expiresAt < Date.now()) return null;
    return token;
}
