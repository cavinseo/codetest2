// Vercel Free 플랜은 프로덕션 배포에 로그인/비밀번호 보호를 지원하지 않아, 앱 레벨에서 HTTP Basic 인증으로 접근을 제한한다.
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
    const sitePassword = process.env.SITE_ACCESS_PASSWORD;

    // 비밀번호가 설정되지 않은 환경(로컬 개발 등)에서는 게이트를 걸지 않는다.
    if (!sitePassword) {
        return NextResponse.next();
    }

    const authHeader = request.headers.get('authorization');

    if (authHeader?.startsWith('Basic ')) {
        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
        const separatorIndex = decoded.indexOf(':');
        const password = separatorIndex === -1 ? '' : decoded.slice(separatorIndex + 1);

        if (password === sitePassword) {
            return NextResponse.next();
        }
    }

    return new NextResponse('Authentication required.', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="KS-QFD"' },
    });
}

export const config = {
    matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
