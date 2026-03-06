import { NextRequest, NextResponse } from 'next/server';
import { isGoogleConfigured } from '@/lib/service-settings';
import { getGoogleAuthUrl } from '@/lib/google-auth';

// GET: Google OAuth 인증 시작 → 인증 URL로 리디렉트
export async function GET(request: NextRequest) {
    if (!isGoogleConfigured()) {
        return NextResponse.json(
            { error: 'Google OAuth가 설정되지 않았습니다. 서비스 설정에서 Client ID를 입력하세요.' },
            { status: 400 }
        );
    }

    const { searchParams } = new URL(request.url);
    const returnUrl = searchParams.get('returnUrl') || '/';
    const projectId = searchParams.get('projectId') || '';

    const redirectUri = `${new URL(request.url).origin}/api/auth/google/callback`;
    const state = JSON.stringify({ returnUrl, projectId });

    const authUrl = getGoogleAuthUrl(redirectUri, state);

    return NextResponse.redirect(authUrl);
}
