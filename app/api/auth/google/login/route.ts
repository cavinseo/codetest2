// Google 회원 로그인 시작. 관리자 서비스 연동(app/api/auth/google)과 별개 흐름이다.
import { NextRequest, NextResponse } from 'next/server';
import { isGoogleConfigured } from '@/lib/service-settings';
import { getGoogleLoginAuthUrl } from '@/lib/google-auth';
import { issueLoginState } from '@/lib/login-state';

const STATE_COOKIE = 'google_login_state';

export async function GET(request: NextRequest) {
    const { origin } = new URL(request.url);

    if (!(await isGoogleConfigured())) {
        return NextResponse.redirect(new URL('/login?error=google_unconfigured', origin));
    }

    const state = issueLoginState();
    const authUrl = await getGoogleLoginAuthUrl(`${origin}/api/auth/google/login/callback`, state);

    const response = NextResponse.redirect(authUrl);
    // 콜백은 google.com 발 최상위 리디렉트라 strict 쿠키가 실리지 않는다.
    // lax 는 최상위 GET 내비게이션에 실리므로 state 대조용으로 딱 맞는다.
    response.cookies.set(STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 300,
        path: '/api/auth/google/login',
    });
    return response;
}
