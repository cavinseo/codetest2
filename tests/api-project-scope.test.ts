// 프로젝트 생성 권한과 목록 조회 범위가 역할을 따르는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findManyProject = vi.fn();
const createProject = vi.fn();
const findUniqueProgram = vi.fn();
const findUniqueUser = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findMany: findManyProject, create: createProject },
        program: { findUnique: findUniqueProgram },
        user: { findUnique: findUniqueUser },
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const { GET, POST } = await import('../app/api/projects/route');

function authAs(role: string, userId = 'user_1') {
    requireAuth.mockResolvedValue({
        userId, email: 'u@x.com', name: '사용자', isAdmin: role === 'ADMIN', role, accessExpiresAt: null,
    });
}

function postRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const validCreateBody = { name: '새 과제', programId: 'prog_1', ownerMenteeId: 'mentee_1' };

// GET 라우트의 select 모양을 그대로 흉내낸 목록 행. role 계산은 ownerId/members 만
// 보므로 나머지 필드는 고정값으로 채운다.
function projectRow(overrides: {
    ownerId: string;
    members: Array<{ role: string }>;
}) {
    return {
        id: 'proj_1',
        name: '프로젝트 1',
        description: null,
        detailedDescription: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        program: { name: '프로그램 1' },
        _count: { members: 0 },
        ...overrides,
    };
}

beforeEach(() => {
    findManyProject.mockResolvedValue([]);
    createProject.mockResolvedValue({
        id: 'proj_new', name: '새 과제', description: null, detailedDescription: null,
        aiMode: 'rule', createdAt: new Date(), updatedAt: new Date(),
    });
    // 기본값: 발행자 자신이 담당 매니저인 프로그램, 그 프로그램에 속한 멘티.
    findUniqueProgram.mockResolvedValue({ id: 'prog_1', name: '프로그램 1', managerId: 'user_1' });
    findUniqueUser.mockResolvedValue({ id: 'mentee_1', role: 'MENTEE', programId: 'prog_1' });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('프로젝트 생성 권한', () => {
    it('멘티는 만들 수 없다', async () => {
        // 관리자·매니저가 과제를 열고 멘토·멘티는 나중에 참가자로 붙는 구조다.
        authAs('MENTEE');

        const res = await POST(postRequest(validCreateBody));

        expect(res.status).toBe(403);
        expect(createProject).not.toHaveBeenCalled();
    });

    it('관리자는 만들 수 있다', async () => {
        authAs('ADMIN');

        const res = await POST(postRequest(validCreateBody));

        expect(res.status).toBe(200);
    });

    it('멘토는 만들 수 없다', async () => {
        // 프로젝트 생성은 관리자·매니저만 한다.
        authAs('MENTOR');

        const res = await POST(postRequest(validCreateBody));

        expect(res.status).toBe(403);
        expect(createProject).not.toHaveBeenCalled();
    });

    it('매니저는 만들 수 있다', async () => {
        authAs('PROGRAM_MANAGER', 'user_1');

        const res = await POST(postRequest(validCreateBody));

        expect(res.status).toBe(200);
        expect(createProject).toHaveBeenCalled();
    });
});

describe('프로젝트 생성 시 프로그램·소유자 검증', () => {
    beforeEach(() => authAs('ADMIN'));

    it('프로그램이 없으면 404', async () => {
        findUniqueProgram.mockResolvedValue(null);

        const res = await POST(postRequest(validCreateBody));

        expect(res.status).toBe(404);
        expect(createProject).not.toHaveBeenCalled();
    });

    it('매니저는 다른 매니저의 프로그램에 만들 수 없다', async () => {
        authAs('PROGRAM_MANAGER', 'pm_1');
        findUniqueProgram.mockResolvedValue({ id: 'prog_1', name: '프로그램 1', managerId: 'other_manager' });

        const res = await POST(postRequest(validCreateBody));

        expect(res.status).toBe(403);
        expect(createProject).not.toHaveBeenCalled();
    });

    it('소유자로 지정한 사용자가 없으면 막는다', async () => {
        findUniqueUser.mockResolvedValue(null);

        const res = await POST(postRequest(validCreateBody));

        expect(res.status).toBe(400);
        expect(createProject).not.toHaveBeenCalled();
    });

    it('멘티가 아닌 사람은 소유자로 지정할 수 없다', async () => {
        findUniqueUser.mockResolvedValue({ id: 'mentor_1', role: 'MENTOR', programId: 'prog_1' });

        const res = await POST(postRequest({ ...validCreateBody, ownerMenteeId: 'mentor_1' }));

        expect(res.status).toBe(400);
        expect(createProject).not.toHaveBeenCalled();
    });

    it('다른 프로그램에 속한 멘티는 소유자로 지정할 수 없다', async () => {
        findUniqueUser.mockResolvedValue({ id: 'mentee_1', role: 'MENTEE', programId: 'prog_other' });

        const res = await POST(postRequest(validCreateBody));

        expect(res.status).toBe(400);
        expect(createProject).not.toHaveBeenCalled();
    });

    it('통과하면 programId 와 ownerId 를 함께 저장한다', async () => {
        await POST(postRequest(validCreateBody));

        const data = createProject.mock.calls[0][0].data;
        expect(data.programId).toBe('prog_1');
        expect(data.ownerId).toBe('mentee_1');
    });
});

describe('프로젝트 목록 범위', () => {
    it('멘티는 소유·참여한 것만 본다', async () => {
        authAs('MENTEE', 'mentee_1');

        await GET(new NextRequest('http://localhost/api/projects'));

        const where = findManyProject.mock.calls[0][0].where;
        // OR 정의 여부만 보면 멤버십 절이 빠져도 통과한다. 두 절이 다 있는지 본다.
        expect(where).toEqual({
            OR: [{ ownerId: 'mentee_1' }, { members: { some: { userId: 'mentee_1' } } }],
        });
    });

    it('관리자는 전체를 본다', async () => {
        authAs('ADMIN', 'admin_1');

        await GET(new NextRequest('http://localhost/api/projects'));

        const where = findManyProject.mock.calls[0][0].where;
        expect(where).toEqual({});
    });

    it('매니저는 전체를 본다', async () => {
        authAs('PROGRAM_MANAGER', 'pm_1');

        await GET(new NextRequest('http://localhost/api/projects'));

        const where = findManyProject.mock.calls[0][0].where;
        expect(where).toEqual({});
    });

    it('멘토는 소유·참여한 것만 본다', async () => {
        authAs('MENTOR', 'mentor_1');

        await GET(new NextRequest('http://localhost/api/projects'));

        const where = findManyProject.mock.calls[0][0].where;
        expect(where).toEqual({
            OR: [{ ownerId: 'mentor_1' }, { members: { some: { userId: 'mentor_1' } } }],
        });
    });
});

describe('프로젝트 목록의 role 필드', () => {
    // requireProjectAccess 가 실제로 주는 접근 권한과 목록의 role 이 어긋나면 안 된다.
    // (docs/superpowers/specs/2026-08-20-member-management-design.md:194-200)
    it('관리자는 배정되지 않은 프로젝트도 ADMIN 으로 나온다', async () => {
        authAs('ADMIN', 'admin_1');
        findManyProject.mockResolvedValue([
            projectRow({ ownerId: 'someone_else', members: [] }),
        ]);

        const res = await GET(new NextRequest('http://localhost/api/projects'));
        const body = await res.json();

        expect(body.projects[0].role).toBe('ADMIN');
    });

    it('관리자는 COACH 로 배정돼 있어도 ADMIN 으로 나온다', async () => {
        authAs('ADMIN', 'admin_1');
        findManyProject.mockResolvedValue([
            projectRow({ ownerId: 'someone_else', members: [{ role: 'COACH' }] }),
        ]);

        const res = await GET(new NextRequest('http://localhost/api/projects'));
        const body = await res.json();

        expect(body.projects[0].role).toBe('ADMIN');
    });

    it('매니저는 배정되지 않은 프로젝트에서 VIEWER 로 나온다', async () => {
        authAs('PROGRAM_MANAGER', 'pm_1');
        findManyProject.mockResolvedValue([
            projectRow({ ownerId: 'someone_else', members: [] }),
        ]);

        const res = await GET(new NextRequest('http://localhost/api/projects'));
        const body = await res.json();

        expect(body.projects[0].role).toBe('VIEWER');
    });

    it('매니저는 COACH 로 배정돼 있으면 COACH 로 나온다', async () => {
        authAs('PROGRAM_MANAGER', 'pm_1');
        findManyProject.mockResolvedValue([
            projectRow({ ownerId: 'someone_else', members: [{ role: 'COACH' }] }),
        ]);

        const res = await GET(new NextRequest('http://localhost/api/projects'));
        const body = await res.json();

        expect(body.projects[0].role).toBe('COACH');
    });

    it('멘티는 자신이 만든 프로젝트에서 OWNER 로 나온다', async () => {
        authAs('MENTEE', 'mentee_1');
        findManyProject.mockResolvedValue([
            projectRow({ ownerId: 'mentee_1', members: [] }),
        ]);

        const res = await GET(new NextRequest('http://localhost/api/projects'));
        const body = await res.json();

        expect(body.projects[0].role).toBe('OWNER');
    });

    it('소속 프로그램명을 함께 내려준다', async () => {
        authAs('MENTEE', 'mentee_1');
        findManyProject.mockResolvedValue([
            projectRow({ ownerId: 'mentee_1', members: [] }),
        ]);

        const res = await GET(new NextRequest('http://localhost/api/projects'));
        const body = await res.json();

        expect(body.projects[0].programName).toBe('프로그램 1');
    });
});
