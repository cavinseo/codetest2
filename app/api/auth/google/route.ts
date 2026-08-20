import { NextRequest, NextResponse } from 'next/server';
import { isGoogleConfigured } from '@/lib/service-settings';
import { getGoogleAuthUrl } from '@/lib/google-auth';
import { requireAdmin } from '@/lib/authorization';

const OAUTH_NONCE_COOKIE = 'google_oauth_nonce';

// GET: Google OAuth 인증 시작 → 인증 URL로 리디렉트
export async function GET(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    if (!(await isGoogleConfigured())) {
        return NextResponse.json(
            { error: 'Google OAuth가 설정되지 않았습니다. 서비스 설정에서 Client ID를 입력하세요.' },
            { status: 400 }
        );
    }

    const { searchParams, origin } = new URL(request.url);
    const rawReturnUrl = searchParams.get('returnUrl') || '/';
    // 오픈 리디렉트 방지: 내부 경로만 허용
    const returnUrl = rawReturnUrl.startsWith('/') ? rawReturnUrl : '/';
    const projectId = searchParams.get('projectId') || '';

    const nonce = crypto.randomUUID();
    const redirectUri = `${origin}/api/auth/google/callback`;
    const state = JSON.stringify({ returnUrl, projectId, nonce });

    const authUrl = await getGoogleAuthUrl(redirectUri, state);

    const response = NextResponse.redirect(authUrl);
    response.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 300, // 5분 내 콜백 완료 기대
        path: '/api/auth/google/callback',
    });
    return response;
}
