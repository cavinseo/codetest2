// Google 로그인 state의 서명, 만료, 컨텍스트 분리를 확인한다.
import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeSessionCookie } from '../lib/auth';
import { issueLoginState, verifyLoginState } from '../lib/login-state';
import { issueOAuthNonce } from '../lib/oauth-nonce';

const LOGIN_STATE_CONTEXT = 'google-login-state.v1';

function signPayload(payload: string, context: string = LOGIN_STATE_CONTEXT): string {
    const signature = createHmac('sha256', 'test-secret')
        .update(`${context}.${payload}`)
        .digest('base64url');
    return `${payload}.${signature}`;
}

function signedState(body: unknown, context?: string): string {
    const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
    return signPayload(payload, context);
}

beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

describe('Google 로그인 state', () => {
    it('발급한 state를 검증하며 매번 다른 nonce를 쓴다', () => {
        const first = issueLoginState();
        const second = issueLoginState();

        expect(verifyLoginState(first)).toBe(true);
        expect(verifyLoginState(second)).toBe(true);
        expect(first).not.toBe(second);
    });

    it('state payload를 명시적인 UTF-8로 직렬화한다', () => {
        const bufferFrom = vi.spyOn(Buffer, 'from');

        issueLoginState();

        expect(bufferFrom).toHaveBeenCalledWith(expect.any(String), 'utf8');
        bufferFrom.mockRestore();
    });

    it('payload를 바꿔 서명이 일치하지 않으면 거부한다', () => {
        const state = issueLoginState();
        const [payload, signature] = state.split('.');
        const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        body.nonce = 'attacker';
        const tampered = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');

        expect(verifyLoginState(`${tampered}.${signature}`)).toBe(false);
    });

    it('발급 후 301초가 지나면 거부한다', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
        const state = issueLoginState();

        vi.advanceTimersByTime(301_000);

        expect(verifyLoginState(state)).toBe(false);
    });

    it('정확히 300초인 만료 경계에서도 거부한다', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
        const state = issueLoginState();

        vi.advanceTimersByTime(300_000);

        expect(verifyLoginState(state)).toBe(false);
    });

    it.each([undefined, '', 'dot-less-value'])(
        '형식이 불완전한 값 %s를 거부한다',
        (value) => {
            expect(verifyLoginState(value)).toBe(false);
        }
    );

    it('payload가 비어 있는 선행 점 값은 서명 계산 전에 거부한다', () => {
        const bufferFrom = vi.spyOn(Buffer, 'from');

        expect(verifyLoginState('.signature')).toBe(false);
        expect(bufferFrom).not.toHaveBeenCalled();
        bufferFrom.mockRestore();
    });

    it('길이가 다른 서명을 거부한다', () => {
        expect(verifyLoginState('e30.short')).toBe(false);
    });

    it('세션 쿠키 산출물은 같은 시크릿이어도 거부한다', () => {
        const sessionCookie = encodeSessionCookie({
            userId: 'user_1',
            email: 'user@example.com',
            name: '사용자',
        });

        expect(verifyLoginState(sessionCookie)).toBe(false);
    });

    it('관리자 OAuth nonce 산출물은 같은 시크릿이어도 거부한다', () => {
        expect(verifyLoginState(issueOAuthNonce('admin_1'))).toBe(false);
    });

    it('google-login-state.v1 컨텍스트만 승인한다', () => {
        const body = {
            nonce: 'nonce_1',
            exp: Math.floor(Date.now() / 1000) + 300,
        };

        expect(verifyLoginState(signedState(body))).toBe(true);
        expect(verifyLoginState(signedState(body, ''))).toBe(false);
    });

    it('서명은 맞아도 payload가 JSON이 아니면 거부한다', () => {
        const payload = Buffer.from('not-json', 'utf8').toString('base64url');

        expect(verifyLoginState(signPayload(payload))).toBe(false);
    });

    it.each([
        { nonce: 'nonce_1' },
        { nonce: 'nonce_1', exp: 'later' },
        { nonce: 'nonce_1', exp: String(Math.floor(Date.now() / 1000) + 300) },
    ])('exp가 유효한 숫자가 아니면 거부한다', (body) => {
        expect(verifyLoginState(signedState(body))).toBe(false);
    });
});
