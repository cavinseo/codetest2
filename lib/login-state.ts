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
const STATE_CONTEXT = 'google-login-state.v2';

const GOOGLE_LOGIN_ROLES = ['PROGRAM_MANAGER', 'MENTOR', 'MENTEE'] as const;
export type GoogleLoginRole = (typeof GOOGLE_LOGIN_ROLES)[number];

interface LoginStatePayload {
    nonce: string;
    exp: number;
    role: GoogleLoginRole;
}

function signPayload(payload: string): string {
    return createHmac('sha256', getSessionSecret())
        .update(`${STATE_CONTEXT}.${payload}`)
        .digest('base64url');
}

export function parseGoogleLoginRole(value: unknown): GoogleLoginRole | null {
    return GOOGLE_LOGIN_ROLES.includes(value as GoogleLoginRole)
        ? value as GoogleLoginRole
        : null;
}

export function issueLoginState(role: GoogleLoginRole): string {
    const body: LoginStatePayload = {
        nonce: randomUUID(),
        exp: Math.floor(Date.now() / 1000) + STATE_MAX_AGE_SECONDS,
        role,
    };
    const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
    return `${payload}.${signPayload(payload)}`;
}

function readLoginState(value: string | undefined): LoginStatePayload | null {
    if (!value) return null;
    const dot = value.lastIndexOf('.');
    if (dot <= 0) return null;

    const payload = value.slice(0, dot);
    const signature = value.slice(dot + 1);
    const expected = signPayload(payload);

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    try {
        const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LoginStatePayload;
        const role = parseGoogleLoginRole(body.role);
        if (typeof body.exp !== 'number' || body.exp <= Math.floor(Date.now() / 1000) || !role) {
            return null;
        }
        return { ...body, role };
    } catch {
        return null;
    }
}

export function verifyLoginState(value: string | undefined): boolean {
    return readLoginState(value) !== null;
}

export function readLoginStateRole(value: string | undefined): GoogleLoginRole | null {
    return readLoginState(value)?.role ?? null;
}
