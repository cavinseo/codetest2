// 로그인 세션 쿠키를 만료시키고 발급된 세션을 무효화하는 로그아웃 API
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '../../../../lib/constants';
import { getSessionUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { createLogger } from '../../../../lib/logger';

const log = createLogger('api/auth/logout');

export async function POST(request: NextRequest) {
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 0,
        path: '/',
    });

    // 쿠키만 지우면 유출된 쿠키는 만료 시각까지 계속 통한다.
    // sessionVersion 을 올려 그 전에 발급된 쿠키를 전부 거부한다.
    const sessionUser = getSessionUser(request);
    if (sessionUser) {
        try {
            await prisma.user.update({
                where: { id: sessionUser.userId },
                data: { sessionVersion: { increment: 1 } },
            });
        } catch (error: unknown) {
            // 여기서 실패해도 쿠키는 이미 지웠다. 이 브라우저에서는 나간 상태다.
            log.error('로그아웃 세션 무효화 실패', error, { userId: sessionUser.userId });
        }
    }

    return response;
}
