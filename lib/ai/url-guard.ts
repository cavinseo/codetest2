// 사용자 입력 원격 엔드포인트의 SSRF 가드.
//
// 원격 MCP 모드는 회원이 임의 URL 을 넣는다. 서버가 그 주소를 대신 두드리므로,
// 내부망·메타데이터 주소를 넣어 서버를 프록시로 쓰는 SSRF 를 막아야 한다.
// 규칙: https 만, 호스트는 공인 호스트명만(로컬·사설 IP·IP 리터럴 금지).

const PRIVATE_HOST_PATTERNS = [
    /^localhost$/i, /^127\./, /^0\.0\.0\.0$/, /^::1$/, /^\[::1\]$/,
    /^10\./, /^192\.168\./, /^169\.254\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
];

export class RemoteUrlError extends Error {}

/** 통과하면 정규화된 origin+path(끝 슬래시 제거)를 돌려준다. 실패는 RemoteUrlError. */
export function assertPublicHttpsUrl(raw: string): string {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new RemoteUrlError('올바른 URL 형식이 아닙니다.');
    }
    if (url.protocol !== 'https:') {
        throw new RemoteUrlError('원격 엔드포인트는 https 만 허용됩니다.');
    }
    if (url.username || url.password) {
        throw new RemoteUrlError('URL 에 인증 정보를 넣을 수 없습니다. 키 칸을 쓰세요.');
    }
    const host = url.hostname;
    // IP 리터럴은 사설 대역 검사망을 피해 갈 수 있어 통째로 막는다. 도메인만 허용.
    if (/^[\d.]+$/.test(host) || host.includes(':')) {
        throw new RemoteUrlError('IP 주소가 아닌 도메인 주소를 입력하세요.');
    }
    if (PRIVATE_HOST_PATTERNS.some((p) => p.test(host))) {
        throw new RemoteUrlError('내부망 주소는 사용할 수 없습니다.');
    }
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}
