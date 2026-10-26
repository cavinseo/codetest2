// 세션 쿠키를 굽고 지우는 곳을 한곳에 둔다.
//
// 로그인·초대 로그인·가입·Google 로그인·비밀번호 변경·로그아웃이 같은 쿠키 옵션
// (httpOnly·sameSite strict·운영에서 secure·경로 /)을 각자 적고 있었다(2026-10-25 코드
// 리뷰 D5). 한 곳만 옵션이 달라지면 같은 이름의 쿠키가 두 벌 생기거나 로그아웃이 그 쿠키를
// 못 지운다.
import { encodeSessionCookie, type SessionUser } from './auth';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from './constants';

export function sessionCookieOptions(maxAge: number = SESSION_MAX_AGE_SECONDS) {
    return {
        httpOnly: true,
        sameSite: 'strict' as const,
        secure: process.env.NODE_ENV === 'production',
        maxAge,
        path: '/',
    };
}

/** next/headers 의 cookies() 와 NextResponse.cookies 둘 다 받는다. */
export interface CookieWriter {
    set(name: string, value: string, options: ReturnType<typeof sessionCookieOptions>): unknown;
}

/**
 * 발급 당시의 sessionVersion 을 서명 안에 넣는다. 이후 비밀번호 변경이나 승인 취소로 값이
 * 올라가면 이 쿠키는 즉시 거부된다.
 */
export function setSessionCookie(store: CookieWriter, user: SessionUser, sessionVersion: number): void {
    store.set(SESSION_COOKIE_NAME, encodeSessionCookie(user, { sessionVersion }), sessionCookieOptions());
}

/** 구울 때와 같은 옵션으로 지워야 브라우저가 같은 쿠키로 보고 지운다. */
export function clearSessionCookie(store: CookieWriter): void {
    store.set(SESSION_COOKIE_NAME, '', sessionCookieOptions(0));
}
