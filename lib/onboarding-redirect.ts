// 온보딩 관문이 막은 응답인지 판정한다.
//
// lib/auth.ts 의 requireAuth 는 온보딩 미완료에 403 과 code:'onboarding_required'
// 를 낸다. 승인 대기·이용기간 만료도 403 이므로 상태 코드만 보면 안 되고,
// 문구는 바뀔 수 있으므로 code 로 판정한다.

const ONBOARDING_CODE = 'onboarding_required';

// 이 경로들에서는 보내지 않는다. 온보딩 화면 자신이 403 을 받았을 때 또 보내면
// 무한 이동이 되고, 로그인·가입 화면은 애초에 세션이 없거나 만드는 중이다.
const EXEMPT_PATHS = ['/onboarding', '/login', '/signup'];

export function isOnboardingBlock(status: number, body: unknown): boolean {
    if (status !== 403) return false;
    if (typeof body !== 'object' || body === null) return false;
    return (body as { code?: unknown }).code === ONBOARDING_CODE;
}

export function shouldRedirectToOnboarding(
    pathname: string,
    status: number,
    body: unknown
): boolean {
    if (!isOnboardingBlock(status, body)) return false;
    // startsWith 만 쓰면 '/loginsomething' 까지 예외가 된다. 경계를 명시한다.
    return !EXEMPT_PATHS.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`)
    );
}
