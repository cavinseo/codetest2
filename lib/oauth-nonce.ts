// 관리자가 시작한 Google OAuth 흐름임을 콜백에서 증명하기 위한 서명 nonce.
//
// 콜백은 google.com 에서 오는 교차 사이트 최상위 리디렉트로 도착한다. 세션
// 쿠키는 SameSite=strict 라 이 요청에는 실리지 않으므로, 콜백은 세션 쿠키로
// 신원을 다시 확인할 수 없다. 대신 세션 쿠키가 정상 동작하는 흐름 시작
// 시점(같은 사이트 요청)에 관리자 신원을 서명해 nonce 에 담아 두고, 콜백은
// 쿠키가 아니라 그 서명을 검증해 신원을 확인한다.
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { getSessionSecret } from './auth';

const NONCE_MAX_AGE_SECONDS = 300;

// nonce 서명에 묶는 컨텍스트. 세션 쿠키는 auth.ts 에서 같은 시크릿으로 순수
// payload 를 서명하므로, 컨텍스트를 붙이지 않으면 세션 쿠키 문자열이 그대로
// 유효한 nonce 로 통과한다(H-2 우회). 컨텍스트를 붙여 두 서명 공간을 분리한다.
const NONCE_CONTEXT = 'google-oauth-nonce.v1';

interface OAuthNoncePayload {
    userId: string;
    nonce: string;
    exp: number; // 만료 시각 (epoch seconds)
}

function signPayload(payload: string): string {
    return createHmac('sha256', getSessionSecret())
        .update(`${NONCE_CONTEXT}.${payload}`)
        .digest('base64url');
}

function nowInSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

export function issueOAuthNonce(userId: string): string {
    const body: OAuthNoncePayload = {
        userId,
        nonce: randomUUID(),
        exp: nowInSeconds() + NONCE_MAX_AGE_SECONDS,
    };
    const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
    return `${payload}.${signPayload(payload)}`;
}

export function verifyOAuthNonce(value: string | undefined): { userId: string } | null {
    if (!value) return null;

    const [payload, signature] = value.split('.');
    if (!payload || !signature) return null;

    try {
        const expected = signPayload(payload);
        const actualBuffer = Buffer.from(signature, 'base64url');
        const expectedBuffer = Buffer.from(expected, 'base64url');
        if (actualBuffer.length !== expectedBuffer.length) return null;
        if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

        const parsed = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf8')
        ) as Partial<OAuthNoncePayload>;

        if (!parsed?.userId) return null;
        if (typeof parsed.exp !== 'number' || parsed.exp <= nowInSeconds()) return null;

        return { userId: parsed.userId };
    } catch {
        return null;
    }
}
