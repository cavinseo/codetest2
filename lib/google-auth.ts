// Google OAuth 2.0 인증 모듈
import { getGoogleSettings, getStoredGoogleToken, GoogleToken, setGoogleToken } from './service-settings';
import { createLogger } from './logger';

const log = createLogger('lib/google-auth');

// 만료 직전 토큰으로 Forms API 를 여러 번 부르다 중간에 끊기지 않도록 조금 일찍 갱신한다.
const TOKEN_REFRESH_MARGIN_MS = 60_000;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SCOPES = [
    'https://www.googleapis.com/auth/forms.body',
    'https://www.googleapis.com/auth/forms.responses.readonly',
].join(' ');

export async function getGoogleAuthUrl(redirectUri: string, state: string): Promise<string> {
    const google = await getGoogleSettings();
    const params = new URLSearchParams({
        client_id: google.clientId,
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
    const google = await getGoogleSettings();
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: google.clientId,
            client_secret: google.clientSecret,
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
    const google = await getGoogleSettings();
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: google.clientId,
            client_secret: google.clientSecret,
            grant_type: 'refresh_token',
        }),
    });

    if (!response.ok) {
        throw new Error('Token refresh failed');
    }

    const data = await response.json();
    // 형식이 어긋난 응답을 저장하면 다음 호출이 undefined 토큰으로 Forms API 를 부른다.
    if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') {
        throw new Error('Token refresh returned an unexpected response');
    }

    return {
        accessToken: data.access_token,
        refreshToken: refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
    };
}

/**
 * Forms API 에 쓸 수 있는 액세스 토큰을 돌려준다. 만료됐거나 곧 만료되면 저장된
 * refresh token 으로 새로 받아 저장한다.
 *
 * 예전에는 만료된 토큰을 그냥 "연동 안 됨"으로 보고 refreshAccessToken 을 어디서도
 * 부르지 않아, 관리자가 연동한 지 1시간이 지나면 설문 생성·응답 가져오기가 매번
 * 재동의를 요구했다(감리 B7).
 *
 * 갱신할 수 없거나(refresh token 없음) Google 이 거절하면(권한 철회 등) null 을
 * 돌려준다. 호출부는 지금처럼 needsAuth 로 재연동을 안내한다. 저장 실패는 숨기지
 * 않고 그대로 던진다 — 연동 문제가 아니라 서버 문제이기 때문이다.
 */
export async function getUsableGoogleToken(now: number = Date.now()): Promise<GoogleToken | null> {
    const stored = await getStoredGoogleToken();
    if (!stored) return null;
    if (stored.expiresAt - TOKEN_REFRESH_MARGIN_MS > now) return stored;
    if (!stored.refreshToken) return null;

    let refreshed: GoogleToken;
    try {
        refreshed = await refreshAccessToken(stored.refreshToken);
    } catch (error) {
        // 토큰 값은 로그에 남기지 않는다. 사유 문구만 남긴다.
        log.warn('Google 액세스 토큰을 갱신하지 못했습니다. 관리자가 다시 연동해야 합니다.', {
            reason: error instanceof Error ? error.message : 'unknown',
        });
        return null;
    }
    await setGoogleToken(refreshed);
    return refreshed;
}

// ─── 회원 로그인용 (관리자 서비스 연동과 별개 흐름) ─────────────────

// 로그인은 신원 확인만 필요하다. Forms 권한을 섞으면 로그인하려는 회원에게
// 폼 접근 동의까지 요구하게 된다.
const LOGIN_SCOPES = 'openid email';

export async function getGoogleLoginAuthUrl(redirectUri: string, state: string): Promise<string> {
    const google = await getGoogleSettings();
    const params = new URLSearchParams({
        client_id: google.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: LOGIN_SCOPES,
        // 계정 선택을 항상 보여준다. 브라우저에 여러 Google 계정이 있을 때
        // 엉뚱한 계정으로 조용히 로그인되는 것을 막는다.
        prompt: 'select_account',
        state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * code 를 교환해 이메일을 얻는다. id_token 은 서명 검증 없이 payload 만 읽는다 —
 * 방금 우리가 client_secret 으로 Google 토큰 엔드포인트에서 직접 받은 값이라
 * 전송 경로에 공격자가 끼어들 자리가 없다(서버-서버 TLS).
 */
export async function exchangeLoginCodeForEmail(
    code: string,
    redirectUri: string
): Promise<{ email: string; verified: boolean }> {
    const google = await getGoogleSettings();
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: google.clientId,
            client_secret: google.clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    });
    if (!response.ok) {
        throw new Error('Google 코드 교환에 실패했습니다.');
    }

    const data = await response.json();
    const idToken: unknown = data.id_token;
    if (typeof idToken !== 'string') {
        throw new Error('id_token 이 없습니다.');
    }
    const parts = idToken.split('.');
    if (parts.length !== 3) {
        throw new Error('id_token 형식이 올바르지 않습니다.');
    }
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof claims.email !== 'string' || !claims.email) {
        throw new Error('이메일 정보를 받지 못했습니다.');
    }
    return { email: claims.email, verified: claims.email_verified === true };
}
