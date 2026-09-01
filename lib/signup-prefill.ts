// Google 로그인에서 "가입된 회원이 없음"으로 튕긴 뒤, 가입 화면에 이메일을 채워 주기
// 위한 단기 전달 통로.
//
// URL 파라미터로 넘기지 않는 이유: 이메일은 PII 이고(lib/logger.ts 규칙), URL 은
// 브라우저 방문 기록과 Referer 에 남는다. 쿠키는 둘 다 피한다.
//
// httpOnly 가 아닌 이유: 가입 화면(클라이언트 컴포넌트)이 직접 읽어 입력란을 채운다.
// 값은 그 브라우저 사용자 본인의 이메일이고, 같은 출처 스크립트만 읽을 수 있다.
//
// **이 값은 신뢰의 근거가 아니다.** 가입 API 는 이 쿠키를 보지 않으며, 이메일 검증도
// 승인 게이트(status: 'PENDING')도 그대로다. 편의를 위한 자동 입력일 뿐이라,
// 누가 쿠키를 손으로 바꿔 넣어도 얻는 것이 없다.

export const SIGNUP_EMAIL_COOKIE = 'google_signup_email';

/** 쿠키가 살아 있는 시간(초). 로그인 실패 직후 곧바로 가입으로 넘어가는 경우만 덮는다. */
export const SIGNUP_EMAIL_MAX_AGE_SECONDS = 300;

/**
 * `document.cookie` 문자열에서 값을 꺼낸다.
 *
 * 직접 파싱하는 이유는 부분 일치 때문이다. `name` 을 단순히 `includes` 로 찾으면
 * `other_google_signup_email` 같은 이름에도 걸린다. 이름 경계를 정확히 맞춰야 한다.
 */
export function readCookieValue(cookieString: string, name: string): string | null {
    if (!cookieString) return null;

    for (const part of cookieString.split(';')) {
        const trimmed = part.trim();
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        if (trimmed.slice(0, eq) !== name) continue;

        const raw = trimmed.slice(eq + 1);
        try {
            return decodeURIComponent(raw);
        } catch {
            // 인코딩이 깨진 값은 채워 넣지 않는다. 빈 입력란이 잘못된 입력란보다 낫다.
            return null;
        }
    }
    return null;
}

/** 가입 화면에 채울 이메일. 없거나 형태가 아니면 null 이다. */
export function readSignupEmail(cookieString: string): string | null {
    const value = readCookieValue(cookieString, SIGNUP_EMAIL_COOKIE);
    if (!value) return null;

    // 쿠키는 손으로 바꿀 수 있다. 특권은 없지만, 입력란에 이상한 값이 들어가
    // 사용자가 혼란스러워지는 것은 막는다.
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 254) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;

    return trimmed;
}
