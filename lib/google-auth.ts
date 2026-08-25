// Google OAuth 2.0 인증 모듈
import { getGoogleSettings, GoogleToken } from './service-settings';

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

    return {
        accessToken: data.access_token,
        refreshToken: refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
    };
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
