// 로그인·OAuth 후 되돌아갈 내부 경로만 통과시키는 판정.
//
// 예전에는 각 라우트가 rawReturnUrl.startsWith('/') 로만 걸렀다. 그런데
// "//evil.com" 은 슬래시로 시작하므로 이 검사를 통과하고, 이후
// new URL(returnUrl, request.url) 이 그것을 protocol-relative URL 로 읽어
// 호스트를 외부로 바꾼다. 즉 오픈 리디렉트가 그대로 열려 있었다.

/**
 * 내부 경로면 그대로, 아니면 '/' 를 돌려준다.
 * 반환값은 항상 '/' 로 시작하고 '//' 나 '/\' 로는 시작하지 않는다.
 */
export function safeReturnUrl(raw: string | null | undefined): string {
    if (!raw) return '/';

    // 첫 글자가 슬래시가 아니면 절대 URL 이거나 스킴이다.
    if (raw[0] !== '/') return '/';
    // 두 번째 글자가 슬래시나 역슬래시면 호스트가 붙는 형태다.
    if (raw[1] === '/' || raw[1] === '\\') return '/';

    return raw;
}
