// OAuth nonce 발급과 검증이 짝을 이루는지 확인하는 테스트.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { issueOAuthNonce, verifyOAuthNonce } from '../lib/oauth-nonce';

// nonce 서명에 묶이는 컨텍스트. 세션 쿠키 서명(컨텍스트 없음)과 분리되어야 한다.
const NONCE_CONTEXT = 'google-oauth-nonce.v1';

beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('OAuth nonce', () => {
    it('발급한 nonce 를 검증하면 같은 userId 를 돌려준다', () => {
        const nonce = issueOAuthNonce('admin_1');

        expect(verifyOAuthNonce(nonce)).toEqual({ userId: 'admin_1' });
    });

    it('서명이 일치하지 않는 nonce 를 거부한다', () => {
        const nonce = issueOAuthNonce('admin_1');
        const [payload, signature] = nonce.split('.');
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        decoded.userId = 'attacker';
        const tamperedPayload = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');

        expect(verifyOAuthNonce(`${tamperedPayload}.${signature}`)).toBeNull();
    });

    it('exp 가 지난 nonce 를 거부한다', () => {
        const payload = Buffer.from(
            JSON.stringify({ userId: 'admin_1', nonce: 'x', exp: Math.floor(Date.now() / 1000) - 10 }),
            'utf8'
        ).toString('base64url');
        const { createHmac } = require('crypto') as typeof import('crypto');
        // 유효한 nonce 서명(컨텍스트 포함)이라 서명 검증은 통과하고, exp 로만 거부돼야 한다.
        const signature = createHmac('sha256', 'test-secret')
            .update(`${NONCE_CONTEXT}.${payload}`)
            .digest('base64url');

        expect(verifyOAuthNonce(`${payload}.${signature}`)).toBeNull();
    });

    it('nonce 컨텍스트 없이 서명한 값(세션 쿠키와 같은 모양)은 거부한다', () => {
        // 세션 쿠키는 base64url(JSON).서명 이고 서명은 순수 payload 로만 만들어진다.
        // userId 가 있고 exp 가 미래라 다른 검사는 모두 통과하므로, 도메인 분리가
        // 없으면 이 값이 유효한 nonce 로 통과해 버린다(H-2 우회).
        const payload = Buffer.from(
            JSON.stringify({ userId: 'mentee_42', exp: Math.floor(Date.now() / 1000) + 300 }),
            'utf8'
        ).toString('base64url');
        const { createHmac } = require('crypto') as typeof import('crypto');
        const signature = createHmac('sha256', 'test-secret').update(payload).digest('base64url');

        expect(verifyOAuthNonce(`${payload}.${signature}`)).toBeNull();
    });

    it('빈 컨텍스트로 서명한 값은 거부한다 (컨텍스트가 실제로 서명에 적용됨)', () => {
        // 컨텍스트가 빈 문자열이면 서명 공간이 다시 세션 쿠키와 겹친다. 컨텍스트를
        // 뺀 채(빈 컨텍스트로) 만든 서명이 통과하지 않아야 도메인 분리가 유지된다.
        const payload = Buffer.from(
            JSON.stringify({ userId: 'admin_1', exp: Math.floor(Date.now() / 1000) + 300 }),
            'utf8'
        ).toString('base64url');
        const { createHmac } = require('crypto') as typeof import('crypto');
        // 컨텍스트가 '' 였다면 서명 입력은 `.${payload}` 가 된다.
        const emptyContextSig = createHmac('sha256', 'test-secret')
            .update(`.${payload}`)
            .digest('base64url');

        expect(verifyOAuthNonce(`${payload}.${emptyContextSig}`)).toBeNull();
    });

    it('undefined 를 거부한다', () => {
        expect(verifyOAuthNonce(undefined)).toBeNull();
    });

    it('빈 문자열을 거부한다', () => {
        expect(verifyOAuthNonce('')).toBeNull();
    });
});
