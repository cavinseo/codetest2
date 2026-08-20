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
        user: {
            findUnique: vi.fn(),
        },
    },
}));

const findProject = vi.mocked(prisma.project.findUnique);
const findUser = vi.mocked(prisma.user.findUnique);

// requireAuth 는 쿠키가 아니라 DB 의 값을 신뢰해 돌려준다(이메일이 바뀌었을 수 있으므로).
// 테스트에서도 그 계약을 그대로 재현하려고, 발급한 세션을 기억해 두고 목이 같은 사용자를
// 돌려주게 한다.
const issuedSessions = new Map<string, SessionUser>();

function requestFor(user: SessionUser, method = 'GET'): NextRequest {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    issuedSessions.set(user.userId, user);
    const cookieValue = encodeSessionCookie(user);
    return new NextRequest('http://localhost/test', {
        method,
        headers: { cookie: `session=${cookieValue}` },
    });
}

function responseStatus(result: unknown): number | null {
    return result instanceof NextResponse ? result.status : null;
}

// requireAuth 가 계정 상태(status/sessionVersion)를 DB 로 확인하므로,
// 기본값은 "승인된 일반 사용자"로 둔다. 관리자 케이스만 개별 테스트에서 덮어쓴다.
function approvedRow(userId: string, overrides: Record<string, unknown> = {}) {
    const issued = issuedSessions.get(userId);
    return {
        id: userId,
        email: issued?.email ?? 'user@example.com',
        name: issued?.name ?? null,
        status: 'APPROVED',
        isAdmin: false,
        sessionVersion: 0,
        ...overrides,
    };
}

describe('authorization helpers', () => {
    beforeEach(() => {
        vi.stubEnv('SESSION_SECRET', 'test-secret');
        findUser.mockImplementation((async (args: { where: { id: string } }) =>
            approvedRow(args.where.id)) as never
        );
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
        // 환경변수 목록에 없는 계정은 DB isAdmin 플래그도 없다고 가정한다.
        findUser.mockImplementation((async (args: { where: { id: string } }) =>
            approvedRow(args.where.id, { isAdmin: false })) as never
        );

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

    it('accepts a DB-flagged admin without an env email entry', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('ADMIN_EMAILS', '');
        findUser.mockImplementation((async (args: { where: { id: string } }) =>
            approvedRow(args.where.id, { isAdmin: true })) as never
        );

        const result = await requireAdmin(
            requestFor({ userId: 'user_admin_seed0001', email: 'admin@ks-qfd.com', name: null })
        );

        expect(responseStatus(result)).toBeNull();
        expect(result).toMatchObject({ email: 'admin@ks-qfd.com' });
    });

    it('rejects a non-admin when the DB row is missing', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('ADMIN_EMAILS', '');
        // 계정이 사라졌으면 관리자는커녕 인증 자체가 통과하면 안 된다.
        findUser.mockResolvedValue(null as never);

        const result = await requireAdmin(
            requestFor({ userId: 'ghost_1', email: 'ghost@example.com', name: null })
        );

        expect(responseStatus(result)).toBe(401);
    });
});
