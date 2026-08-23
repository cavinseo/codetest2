import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { encodeSessionCookie, type SessionUser } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { hasAdminAccess, requireAdmin, requireProjectAccess, type ProjectAccess } from '../lib/authorization';
import type { MemberRole } from '../lib/member-roles';

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
        // requireAuth 가 이제 role/accessExpiresAt 도 돌려주므로 기본값을 명시한다.
        // 명시하지 않으면 시스템 역할 관련 테스트가 undefined 를 보고 조용히 틀릴 수 있다.
        role: 'MENTEE',
        accessExpiresAt: null,
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

describe('hasAdminAccess', () => {
    // requireAdmin 과 화면(dashboard/admin)이 같은 답을 내야 한다는 계약을 지키는지
    // 본다. 예전에는 화면이 isAdmin/role 만 보고 판단해 ADMIN_EMAILS 로 들어오는
    // 계정이 링크를 잃었다 — 그 회귀 케이스를 여기서 고정한다.
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('isAdmin 플래그가 켜져 있으면 true 다', () => {
        expect(hasAdminAccess({ email: 'user@example.com', isAdmin: true })).toBe(true);
    });

    it('ADMIN_EMAILS 에 등록된 이메일이면 isAdmin 이 false 여도 true 다', () => {
        vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');

        expect(hasAdminAccess({ email: 'admin@example.com', isAdmin: false })).toBe(true);
    });

    it('평범한 회원이면 false 다', () => {
        vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');

        expect(hasAdminAccess({ email: 'user@example.com', isAdmin: false })).toBe(false);
    });
});

describe('시스템 역할에 따른 프로젝트 접근', () => {
    // 이 블록의 헬퍼는 "authorization helpers" 블록의 mock 방식(prisma.user.findUnique 를
    // 통해 requireAuth 를 실제로 통과시키는 방식)을 그대로 따른다. mockAuthUser 가 지정한
    // 사용자를 req() 가 이어받아 요청을 만든다.
    let currentUser: SessionUser | null = null;

    function mockAuthUser(overrides: { userId: string; role: MemberRole; isAdmin?: boolean }) {
        const email = `${overrides.userId}@example.com`;
        currentUser = { userId: overrides.userId, email, name: null };
        findUser.mockImplementation((async (args: { where: { id: string } }) =>
            approvedRow(args.where.id, {
                email,
                isAdmin: overrides.isAdmin ?? false,
                role: overrides.role,
            })) as never
        );
    }

    function mockProject(overrides: { ownerId: string; members: Array<{ role: string }> }) {
        findProject.mockResolvedValue(overrides as never);
    }

    function req(method = 'GET'): NextRequest {
        if (!currentUser) {
            throw new Error('req() 호출 전에 mockAuthUser() 로 사용자를 지정해야 한다.');
        }
        return requestFor(currentUser, method);
    }

    beforeEach(() => {
        vi.stubEnv('SESSION_SECRET', 'test-secret');
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
        currentUser = null;
    });

    it('관리자는 남의 프로젝트에도 ADMIN 으로 들어간다', async () => {
        // 관리자는 이상의 모든 권한을 가진다. 명시 역할이 없어도 전권이다.
        mockAuthUser({ userId: 'admin_1', role: 'ADMIN', isAdmin: true });
        mockProject({ ownerId: 'someone_else', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1');

        expect(result).not.toBeInstanceOf(NextResponse);
        expect((result as ProjectAccess).role).toBe('ADMIN');
    });

    it('매니저는 배정되지 않은 프로젝트에 VIEWER 로 들어간다', async () => {
        mockAuthUser({ userId: 'pm_1', role: 'PROGRAM_MANAGER', isAdmin: false });
        mockProject({ ownerId: 'someone_else', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1');

        expect((result as ProjectAccess).role).toBe('VIEWER');
    });

    it('VIEWER 는 쓰기가 막힌다', async () => {
        mockAuthUser({ userId: 'pm_1', role: 'PROGRAM_MANAGER', isAdmin: false });
        mockProject({ ownerId: 'someone_else', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1', { write: true });

        expect(result).toBeInstanceOf(NextResponse);
        expect((result as NextResponse).status).toBe(403);
    });

    it('배정되지 않은 멘토는 거부된다', async () => {
        mockAuthUser({ userId: 'mentor_1', role: 'MENTOR', isAdmin: false });
        mockProject({ ownerId: 'someone_else', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1');

        expect(result).toBeInstanceOf(NextResponse);
        expect((result as NextResponse).status).toBe(403);
    });

    it('배정된 멘토는 COACH 로 들어간다', async () => {
        mockAuthUser({ userId: 'mentor_1', role: 'MENTOR', isAdmin: false });
        mockProject({ ownerId: 'someone_else', members: [{ role: 'COACH' }] });

        const result = await requireProjectAccess(req(), 'proj_1');

        expect((result as ProjectAccess).role).toBe('COACH');
    });

    it('VIEWER 는 roles 로 특정 역할을 요구하는 라우트에서도 막힌다', async () => {
        // 팀원 초대처럼 소유자만 하는 동작이 매니저에게 열리면 안 된다.
        mockAuthUser({ userId: 'pm_1', role: 'PROGRAM_MANAGER', isAdmin: false });
        mockProject({ ownerId: 'someone_else', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1', { roles: ['OWNER'] });

        expect(result).toBeInstanceOf(NextResponse);
        expect((result as NextResponse).status).toBe(403);
    });

    it('소유자는 시스템 역할과 무관하게 OWNER 다', async () => {
        mockAuthUser({ userId: 'mentee_1', role: 'MENTEE', isAdmin: false });
        mockProject({ ownerId: 'mentee_1', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1');

        expect((result as ProjectAccess).role).toBe('OWNER');
    });

    it('매니저의 명시 EDITOR 는 쓰기로 승격되지 않는다', async () => {
        // PROGRAM_MANAGER 는 전체를 읽되 고치지 못한다. 팀 초대로 EDITOR 행이
        // 생겨도 그 역할로 쓰기가 열리면 §2("매니저는 내용을 수정할 수 없다")가 깨진다.
        mockAuthUser({ userId: 'pm_1', role: 'PROGRAM_MANAGER', isAdmin: false });
        mockProject({ ownerId: 'someone_else', members: [{ role: 'EDITOR' }] });

        const readResult = await requireProjectAccess(req(), 'proj_1');
        expect((readResult as ProjectAccess).role).toBe('VIEWER');

        const writeResult = await requireProjectAccess(req(), 'proj_1', { write: true });
        expect(writeResult).toBeInstanceOf(NextResponse);
        expect((writeResult as NextResponse).status).toBe(403);
    });

    it('매니저가 소유한 프로젝트는 OWNER 로 쓰기가 유지된다', async () => {
        // 승격 전에 직접 만든 프로젝트의 소유권은 실제 관계이므로 EDITOR 강등과
        // 무관하게 유지되어야 한다.
        mockAuthUser({ userId: 'pm_1', role: 'PROGRAM_MANAGER', isAdmin: false });
        mockProject({ ownerId: 'pm_1', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1', { write: true });

        expect(result).not.toBeInstanceOf(NextResponse);
        expect((result as ProjectAccess).role).toBe('OWNER');
    });

    it('관리자는 자기 소유 프로젝트의 OWNER 전용 라우트에서도 통과한다', async () => {
        // 관리자 escalation 이 OWNER 를 덮어쓰면 팀원 초대에서 스스로 막힌다.
        mockAuthUser({ userId: 'admin_1', role: 'ADMIN', isAdmin: true });
        mockProject({ ownerId: 'admin_1', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1', { roles: ['OWNER'] });

        expect(result).not.toBeInstanceOf(NextResponse);
    });

    it('매니저가 코치로 배정돼 있으면 COACH 이고 쓰기는 막힌다', async () => {
        mockAuthUser({ userId: 'pm_1', role: 'PROGRAM_MANAGER', isAdmin: false });
        mockProject({ ownerId: 'someone_else', members: [{ role: 'COACH' }] });

        const readResult = await requireProjectAccess(req(), 'proj_1');
        expect((readResult as ProjectAccess).role).toBe('COACH');

        const writeResult = await requireProjectAccess(req(), 'proj_1', { write: true });
        expect(writeResult).toBeInstanceOf(NextResponse);
        expect((writeResult as NextResponse).status).toBe(403);
    });

    it('관리자가 코치로 배정돼 있어도 전권을 갖는다', async () => {
        mockAuthUser({ userId: 'admin_1', role: 'ADMIN', isAdmin: true });
        mockProject({ ownerId: 'someone_else', members: [{ role: 'COACH' }] });

        const result = await requireProjectAccess(req(), 'proj_1', { write: true });

        expect(result).not.toBeInstanceOf(NextResponse);
        expect((result as ProjectAccess).role).toBe('ADMIN');
    });
});
