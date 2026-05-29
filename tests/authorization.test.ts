import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { encodeSessionCookie, type SessionUser } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { requireAdmin, requireProjectAccess } from '../lib/authorization';

vi.mock('../lib/prisma', () => ({
    prisma: {
        project: {
            findUnique: vi.fn(),
        },
    },
}));

const findProject = vi.mocked(prisma.project.findUnique);

function requestFor(user: SessionUser, method = 'GET'): NextRequest {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    const cookieValue = encodeSessionCookie(user);
    return new NextRequest('http://localhost/test', {
        method,
        headers: { cookie: `session=${cookieValue}` },
    });
}

function responseStatus(result: unknown): number | null {
    return result instanceof NextResponse ? result.status : null;
}

describe('authorization helpers', () => {
    beforeEach(() => {
        vi.stubEnv('SESSION_SECRET', 'test-secret');
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
    });

    it('allows a project owner to read and write', async () => {
        findProject.mockResolvedValue({
            ownerId: 'owner_1',
            members: [],
        } as never);

        const readResult = await requireProjectAccess(
            requestFor({ userId: 'owner_1', email: 'owner@example.com', name: null }),
            'project_1'
        );
        const writeResult = await requireProjectAccess(
            requestFor({ userId: 'owner_1', email: 'owner@example.com', name: null }, 'POST'),
            'project_1',
            { write: true }
        );

        expect(responseStatus(readResult)).toBeNull();
        expect(responseStatus(writeResult)).toBeNull();
        expect(readResult).toMatchObject({ role: 'OWNER' });
        expect(writeResult).toMatchObject({ role: 'OWNER' });
    });

    it('allows an editor to write', async () => {
        findProject.mockResolvedValue({
            ownerId: 'owner_1',
            members: [{ role: 'EDITOR' }],
        } as never);

        const result = await requireProjectAccess(
            requestFor({ userId: 'editor_1', email: 'editor@example.com', name: null }, 'POST'),
            'project_1',
            { write: true }
        );

        expect(responseStatus(result)).toBeNull();
        expect(result).toMatchObject({ role: 'EDITOR' });
    });

    it('allows a coach to read but rejects writes', async () => {
        findProject.mockResolvedValue({
            ownerId: 'owner_1',
            members: [{ role: 'COACH' }],
        } as never);

        const readResult = await requireProjectAccess(
            requestFor({ userId: 'coach_1', email: 'coach@example.com', name: null }),
            'project_1'
        );
        const writeResult = await requireProjectAccess(
            requestFor({ userId: 'coach_1', email: 'coach@example.com', name: null }, 'POST'),
            'project_1',
            { write: true }
        );

        expect(responseStatus(readResult)).toBeNull();
        expect(readResult).toMatchObject({ role: 'COACH' });
        expect(responseStatus(writeResult)).toBe(403);
    });

    it('rejects a non-member', async () => {
        findProject.mockResolvedValue({
            ownerId: 'owner_1',
            members: [],
        } as never);

        const result = await requireProjectAccess(
            requestFor({ userId: 'outsider_1', email: 'outsider@example.com', name: null }),
            'project_1'
        );

        expect(responseStatus(result)).toBe(403);
    });

    it('returns 404 for a missing project', async () => {
        findProject.mockResolvedValue(null as never);

        const result = await requireProjectAccess(
            requestFor({ userId: 'user_1', email: 'user@example.com', name: null }),
            'missing_project'
        );

        expect(responseStatus(result)).toBe(404);
    });

    it('requires explicit admin email in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('ADMIN_EMAILS', 'admin@example.com,ops@example.com');

        const adminResult = await requireAdmin(
            requestFor({ userId: 'admin_1', email: 'admin@example.com', name: null })
        );
        const userResult = await requireAdmin(
            requestFor({ userId: 'user_1', email: 'user@example.com', name: null })
        );

        expect(responseStatus(adminResult)).toBeNull();
        expect(adminResult).toMatchObject({ email: 'admin@example.com' });
        expect(responseStatus(userResult)).toBe(403);
    });
});
