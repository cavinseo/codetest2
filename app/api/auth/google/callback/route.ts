import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/google-auth';
import { setGoogleToken } from '@/lib/service-settings';

// GET: Google OAuth 콜백 처리
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const stateStr = searchParams.get('state') || '{}';
    const error = searchParams.get('error');

    if (error) {
        return NextResponse.redirect(new URL(`/?error=google_auth_denied`, request.url));
    }

    if (!code) {
        return NextResponse.redirect(new URL(`/?error=no_code`, request.url));
    }

    try {
        let state: { returnUrl?: string; projectId?: string } = {};
        try {
            state = JSON.parse(stateStr);
        } catch { }

        const redirectUri = `${new URL(request.url).origin}/api/auth/google/callback`;
        const token = await exchangeCodeForToken(code, redirectUri);

        // 토큰 저장 (여기서는 'default' 사용자로 저장)
        setGoogleToken('default', token);

        // 원래 페이지로 돌아가기
        const returnUrl = state.returnUrl || '/';
        return NextResponse.redirect(new URL(`${returnUrl}?google_auth=success`, request.url));
    } catch (err: any) {
        console.error('Google OAuth callback error:', err);
        return NextResponse.redirect(
            new URL(`/?error=google_auth_failed&message=${encodeURIComponent(err.message)}`, request.url)
        );
    }
}
