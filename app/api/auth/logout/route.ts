// 로그인 세션 쿠키를 만료시키는 로그아웃 API
import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '../../../../lib/constants';

export async function POST() {
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 0,
        path: '/',
    });

    return response;
}
