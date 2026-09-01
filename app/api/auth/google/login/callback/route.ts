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
import { SIGNUP_EMAIL_COOKIE, SIGNUP_EMAIL_MAX_AGE_SECONDS } from '@/lib/signup-prefill';

const log = createLogger('api/auth/google/login/callback');
const STATE_COOKIE = 'google_login_state';

function fail(origin: string, code: string): NextResponse {
    const response = NextResponse.redirect(new URL(`/login?error=${code}`, origin));
    response.cookies.delete(STATE_COOKIE);
    return response;
}

/**
 * 가입된 회원이 없을 때, 가입 화면이 이메일을 채울 수 있도록 남긴다.
 *
 * URL 파라미터가 아니라 쿠키인 이유는 이메일이 PII 이기 때문이다 — URL 은 브라우저
 * 방문 기록과 Referer 에 남는다.
 *
 * 이 쿠키는 신뢰의 근거가 아니다. 가입 API 는 읽지 않고, 승인 게이트도 그대로다.
 * 이 경로로 계정이 만들어지는 일은 없으며 입력 수고만 덜어 준다.
 */
function offerSignup(origin: string, email: string): NextResponse {
    const response = fail(origin, 'no_account');
    response.cookies.set(SIGNUP_EMAIL_COOKIE, email, {
        // 가입 화면(클라이언트)이 직접 읽어야 하므로 httpOnly 가 아니다.
        httpOnly: false,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: SIGNUP_EMAIL_MAX_AGE_SECONDS,
        path: '/',
    });
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

        // 승인 대기·기한 만료는 이미 계정이 있는 경우라 가입을 권하면 안 된다.
        // 가입을 권하는 것은 계정이 아예 없을 때뿐이다.
        if (!user) return offerSignup(origin, email);
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
