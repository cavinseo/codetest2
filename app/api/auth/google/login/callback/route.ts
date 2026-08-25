// Google 회원 로그인 콜백. 승인된 기존 회원만 로그인시킨다 — 자동 가입 없음.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encodeSessionCookie } from '@/lib/auth';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/constants';
import { exchangeLoginCodeForEmail } from '@/lib/google-auth';
import { verifyLoginState } from '@/lib/login-state';
import { isAccessExpired, parseMemberRole } from '@/lib/member-roles';
import { isProfileCompleteForRole } from '@/lib/member-profile';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/auth/google/login/callback');
const STATE_COOKIE = 'google_login_state';

function fail(origin: string, code: string): NextResponse {
    const response = NextResponse.redirect(new URL(`/login?error=${code}`, origin));
    response.cookies.delete(STATE_COOKIE);
    return response;
}

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);

    if (searchParams.get('error')) return fail(origin, 'google_denied');

    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const stateCookie = request.cookies.get(STATE_COOKIE)?.value;

    // 파라미터·쿠키 각각 서명 검증 + 상호 동일성. 쿠키만 믿으면 공격자가 자기
    // 브라우저의 쿠키로 피해자 URL 을 열게 하는 고정 공격이 남는다.
    if (!code || !verifyLoginState(stateParam ?? undefined)
        || !verifyLoginState(stateCookie) || stateParam !== stateCookie) {
        return fail(origin, 'google_state');
    }

    try {
        const { email, verified } = await exchangeLoginCodeForEmail(
            code, `${origin}/api/auth/google/login/callback`
        );
        if (!verified) return fail(origin, 'google_unverified');

        // 비밀번호 로그인은 정확 일치 조회지만, Google 은 이메일을 소문자로
        // 정규화해 주므로 DB 의 혼합 표기(Mentee1@…)와 대소문자 무시로 맞춘다.
        const user = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
        });

        if (!user) return fail(origin, 'no_account');
        if (user.status !== 'APPROVED') return fail(origin, 'pending');
        if (isAccessExpired(user.accessExpiresAt)) return fail(origin, 'expired');

        const [profile] = await Promise.all([
            prisma.memberProfile.findUnique({ where: { userId: user.id } }),
        ]);
        const role = parseMemberRole(user.role) ?? 'MENTEE';
        const needsOnboarding = user.mustChangePassword
            || !isProfileCompleteForRole(role, profile);

        const response = NextResponse.redirect(
            new URL(needsOnboarding ? '/onboarding' : '/dashboard', origin)
        );
        response.cookies.delete(STATE_COOKIE);
        response.cookies.set(SESSION_COOKIE_NAME, encodeSessionCookie(
            { userId: user.id, email: user.email, name: user.name },
            { sessionVersion: user.sessionVersion }
        ), {
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: SESSION_MAX_AGE_SECONDS,
            path: '/',
        });

        // 이메일은 로그에 남기지 않는다. userId 만.
        log.info('Google 로그인 성공', { userId: user.id });
        return response;
    } catch (error) {
        log.error('Google 로그인 콜백 실패', error);
        return fail(origin, 'google_failed');
    }
}
