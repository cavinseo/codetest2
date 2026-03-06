// Google OAuth 2.0 인증 모듈
import { serviceSettings, setGoogleToken, GoogleToken } from './service-settings';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SCOPES = [
    'https://www.googleapis.com/auth/forms.body',
    'https://www.googleapis.com/auth/forms.responses.readonly',
].join(' ');

export function getGoogleAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
        client_id: serviceSettings.google.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state,
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(
    code: string,
    redirectUri: string
): Promise<GoogleToken> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: serviceSettings.google.clientId,
            client_secret: serviceSettings.google.clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
    }

    const data = await response.json();

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
    };
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleToken> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: serviceSettings.google.clientId,
            client_secret: serviceSettings.google.clientSecret,
            grant_type: 'refresh_token',
        }),
    });

    if (!response.ok) {
        throw new Error('Token refresh failed');
    }

    const data = await response.json();

    return {
        accessToken: data.access_token,
        refreshToken: refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
    };
}
