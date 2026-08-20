// OAuth nonce 발급과 검증이 짝을 이루는지 확인하는 테스트.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { issueOAuthNonce, verifyOAuthNonce } from '../lib/oauth-nonce';

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
        const signature = createHmac('sha256', 'test-secret').update(payload).digest('base64url');

        expect(verifyOAuthNonce(`${payload}.${signature}`)).toBeNull();
    });

    it('undefined 를 거부한다', () => {
        expect(verifyOAuthNonce(undefined)).toBeNull();
    });

    it('빈 문자열을 거부한다', () => {
        expect(verifyOAuthNonce('')).toBeNull();
    });
});
