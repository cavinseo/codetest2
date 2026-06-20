import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/google-auth';
import { setGoogleToken } from '@/lib/service-settings';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/auth/google/callback');
const OAUTH_NONCE_COOKIE = 'google_oauth_nonce';

// GET: Google OAuth 콜백 처리
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const stateStr = searchParams.get('state') || '{}';
    const error = searchParams.get('error');

    if (error) {
        return NextResponse.redirect(new URL(`/?error=google_auth_denied`, request.url));
    }

    if (!code) {
        return NextResponse.redirect(new URL(`/?error=no_code`, request.url));
    }

    let state: { returnUrl?: string; projectId?: string; nonce?: string } = {};
    try {
        state = JSON.parse(stateStr);
    } catch { }

    // CSRF 방어: state의 nonce와 쿠키의 nonce 일치 여부 검증
    const cookieNonce = request.cookies.get(OAUTH_NONCE_COOKIE)?.value;
    if (!cookieNonce || !state.nonce || cookieNonce !== state.nonce) {
        log.error('OAuth nonce mismatch — possible CSRF attempt');
        return NextResponse.redirect(new URL(`/?error=invalid_state`, request.url));
    }

    // 오픈 리디렉트 방지: 내부 경로만 허용
    const rawReturnUrl = state.returnUrl || '/';
    const returnUrl = rawReturnUrl.startsWith('/') ? rawReturnUrl : '/';

    try {
        const redirectUri = `${origin}/api/auth/google/callback`;
        const token = await exchangeCodeForToken(code, redirectUri);

        // 서비스 레벨 Google Forms 토큰 저장 (인스턴스당 단일 서비스 계정)
        setGoogleToken('default', token);

        const response = NextResponse.redirect(new URL(`${returnUrl}?google_auth=success`, request.url));
        // nonce 쿠키 즉시 만료
        response.cookies.set(OAUTH_NONCE_COOKIE, '', { maxAge: 0, path: '/api/auth/google/callback' });
        return response;
    } catch (err: unknown) {
        log.error('Google OAuth callback error', err);
        return NextResponse.redirect(new URL(`/?error=google_auth_failed`, request.url));
    }
}
