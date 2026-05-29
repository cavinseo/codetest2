import { describe, expect, it, vi, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { encodeSessionCookie, getSessionUser, requireAuth, type SessionUser } from '../lib/auth';

function requestWithSessionCookie(cookieValue?: string): NextRequest {
    return new NextRequest('http://localhost/test', {
        headers: cookieValue ? { cookie: `session=${cookieValue}` } : {},
    });
}

describe('auth session cookies', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('accepts a signed session cookie', () => {
        vi.stubEnv('SESSION_SECRET', 'test-secret');
        const session: SessionUser = {
            userId: 'user_1',
            email: 'user@example.com',
            name: 'Test User',
        };

        const cookieValue = encodeSessionCookie(session);
        const result = getSessionUser(requestWithSessionCookie(cookieValue));

        expect(result).toEqual(session);
    });

    it('rejects a tampered signed session cookie', () => {
        vi.stubEnv('SESSION_SECRET', 'test-secret');
        const cookieValue = encodeSessionCookie({
            userId: 'user_1',
            email: 'user@example.com',
            name: null,
        });
        const [payload, signature] = cookieValue.split('.');
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        decoded.userId = 'user_2';
        const tamperedPayload = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
        const tampered = `${tamperedPayload}.${signature}`;

        expect(getSessionUser(requestWithSessionCookie(tampered))).toBeNull();
    });

    it('rejects unsigned JSON cookies in production', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('SESSION_SECRET', 'test-secret');
        const unsignedCookie = JSON.stringify({
            userId: 'user_1',
            email: 'user@example.com',
            name: null,
        });

        expect(getSessionUser(requestWithSessionCookie(unsignedCookie))).toBeNull();
    });

    it('returns a 401 response when authentication is missing', () => {
        const result = requireAuth(requestWithSessionCookie());

        expect(result).toBeInstanceOf(NextResponse);
        expect((result as NextResponse).status).toBe(401);
    });
});
