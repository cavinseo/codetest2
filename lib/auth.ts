import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from './constants';

export interface SessionUser {
    userId: string;
    email: string;
    name: string | null;
}

function getSessionSecret(): string {
    const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('SESSION_SECRET or NEXTAUTH_SECRET is required in production.');
    }
    return secret || 'development-session-secret';
}

function signPayload(payload: string): string {
    return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

export function encodeSessionCookie(sessionUser: SessionUser): string {
    const payload = Buffer.from(JSON.stringify(sessionUser), 'utf8').toString('base64url');
    return `${payload}.${signPayload(payload)}`;
}

function decodeSignedSessionCookie(cookieValue: string): Partial<SessionUser> | null {
    const [payload, signature] = cookieValue.split('.');
    if (!payload || !signature) return null;

    const expected = signPayload(payload);
    const actualBuffer = Buffer.from(signature, 'base64url');
    const expectedBuffer = Buffer.from(expected, 'base64url');
    if (actualBuffer.length !== expectedBuffer.length) return null;
    if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<SessionUser>;
}

export function getSessionUser(request: NextRequest): SessionUser | null {
    const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!cookieValue) return null;

    try {
        const parsed =
            decodeSignedSessionCookie(cookieValue) ??
            (process.env.NODE_ENV !== 'production'
                ? (JSON.parse(cookieValue) as Partial<SessionUser>)
                : null);

        if (!parsed?.userId || !parsed.email) return null;
        return { userId: parsed.userId, email: parsed.email, name: parsed.name ?? null };
    } catch {
        return null;
    }
}

export function requireAuth(request: NextRequest): SessionUser | NextResponse {
    const sessionUser = getSessionUser(request);
    if (!sessionUser) {
        return NextResponse.json({ error: 'Login required.' }, { status: 401 });
    }
    return sessionUser;
}
