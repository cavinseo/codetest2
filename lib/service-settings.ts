// 서비스 전체 설정 저장소
// Google OAuth 자격증명 등 서비스 레벨 설정 관리

export interface ServiceSettings {
    google: {
        clientId: string;
        clientSecret: string;
        configured: boolean;
    };
    smtp?: {
        host: string;
        port: number;
        user: string;
        pass: string;
        configured: boolean;
    };
}

interface GlobalSettingsStore {
    __service_settings: ServiceSettings;
    __google_tokens: Record<string, GoogleToken>; // userId -> token
}

export interface GoogleToken {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

const g = globalThis as unknown as GlobalSettingsStore;

if (!g.__service_settings) {
    g.__service_settings = {
        google: {
            clientId: '',
            clientSecret: '',
            configured: false,
        },
        smtp: {
            host: '',
            port: 587,
            user: '',
            pass: '',
            configured: false,
        },
    };
}

if (!g.__google_tokens) {
    g.__google_tokens = {};
}

export const serviceSettings = g.__service_settings;
export const googleTokens = g.__google_tokens;

export function updateGoogleSettings(clientId: string, clientSecret: string) {
    serviceSettings.google.clientId = clientId;
    serviceSettings.google.clientSecret = clientSecret;
    serviceSettings.google.configured = !!(clientId && clientSecret);
}

export function updateSmtpSettings(host: string, port: number, user: string, pass: string) {
    if (!serviceSettings.smtp) {
        serviceSettings.smtp = { host: '', port: 587, user: '', pass: '', configured: false };
    }
    serviceSettings.smtp.host = host;
    serviceSettings.smtp.port = port;
    serviceSettings.smtp.user = user;
    serviceSettings.smtp.pass = pass;
    serviceSettings.smtp.configured = !!(host && user && pass);
}

export function isSmtpConfigured(): boolean {
    return serviceSettings.smtp?.configured || false;
}

export function isGoogleConfigured(): boolean {
    return serviceSettings.google.configured;
}

export function setGoogleToken(userId: string, token: GoogleToken) {
    googleTokens[userId] = token;
}

export function getGoogleToken(userId: string): GoogleToken | undefined {
    const token = googleTokens[userId];
    if (token && token.expiresAt < Date.now()) {
        return undefined; // 만료됨
    }
    return token;
}
