// Google 로그인 흐름의 CSRF state 서명.
//
// 콜백은 google.com 발 교차 사이트 리디렉트라 strict 세션 쿠키가 실리지 않고,
// 로그인 전이라 신원도 없다. 그래서 익명 서명 토큰을 시작 시점에 발급해
// lax 쿠키와 URL 파라미터 양쪽으로 보내고, 콜백에서 둘을 대조한다.
//
// 컨텍스트 분리: 세션 쿠키(auth.ts)와 관리자 nonce(oauth-nonce.ts)가 같은
// 시크릿을 쓰므로, 전용 컨텍스트가 없으면 그 값들이 state 로 통과한다.
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { getSessionSecret } from './auth';

const STATE_MAX_AGE_SECONDS = 300;
const STATE_CONTEXT = 'google-login-state.v1';

interface LoginStatePayload {
    nonce: string;
    exp: number;
}

function signPayload(payload: string): string {
    return createHmac('sha256', getSessionSecret())
        .update(`${STATE_CONTEXT}.${payload}`)
        .digest('base64url');
}

export function issueLoginState(): string {
    const body: LoginStatePayload = {
        nonce: randomUUID(),
        exp: Math.floor(Date.now() / 1000) + STATE_MAX_AGE_SECONDS,
    };
    const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
    return `${payload}.${signPayload(payload)}`;
}

export function verifyLoginState(value: string | undefined): boolean {
    if (!value) return false;
    const dot = value.lastIndexOf('.');
    if (dot <= 0) return false;

    const payload = value.slice(0, dot);
    const signature = value.slice(dot + 1);
    const expected = signPayload(payload);

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

    try {
        const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LoginStatePayload;
        return typeof body.exp === 'number' && body.exp > Math.floor(Date.now() / 1000);
    } catch {
        return false;
    }
}
