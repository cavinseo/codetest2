// 역할마다 다른 "내 소속" 을 돌려주는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueUser = vi.fn();
const findManyProject = vi.fn();
const findManyProjectMember = vi.fn();
const findManyProgram = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUniqueUser },
        project: { findMany: findManyProject },
        projectMember: { findMany: findManyProjectMember },
        program: { findMany: findManyProgram },
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const { GET } = await import('../app/api/me/affiliation/route');

const PROGRAM_ROW = {
    id: 'prog_1', name: '프로그램 A', organization: '가나기술원',
    startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2027-02-28T00:00:00Z'),
};

function authAs(role: string, userId = 'user_1') {
    requireAuth.mockResolvedValue({
        userId, email: 'u@x.com', name: '사용자', isAdmin: role === 'ADMIN', role, accessExpiresAt: null,
    });
}

function call() {
    return GET(new NextRequest('http://localhost/api/me/affiliation'));
}

beforeEach(() => {
    findUniqueUser.mockResolvedValue({ program: null });
    findManyProject.mockResolvedValue([]);
    findManyProjectMember.mockResolvedValue([]);
    findManyProgram.mockResolvedValue([]);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('멘티의 소속', () => {
    beforeEach(() => authAs('MENTEE', 'mentee_1'));

    it('참여 중인 프로그램을 준다', async () => {
        findUniqueUser.mockResolvedValue({ program: PROGRAM_ROW });

        const body = await (await call()).json();

        expect(body.program).toMatchObject({
            id: 'prog_1', name: '프로그램 A', organization: '가나기술원',
        });
        // 날짜는 화면이 그대로 자를 수 있도록 ISO 문자열로 내려간다.
        expect(body.program.startsAt).toBe('2026-09-01T00:00:00.000Z');
    });

    it('프로그램이 없으면 null 이다', async () => {
        const body = await (await call()).json();

        expect(body.program).toBeNull();
    });

    it('내 프로젝트를 맡은 멘토를 담당 멘토로 준다', async () => {
        findManyProject.mockResolvedValue([
            { name: '내 프로젝트', members: [{ user: { id: 'u1', name: '김멘토', email: 'kim@x.com' } }] },
        ]);

        const body = await (await call()).json();

        expect(body.mentors).toHaveLength(1);
        expect(body.mentors[0]).toMatchObject({ name: '김멘토', email: 'kim@x.com' });
        expect(body.mentors[0].projectNames).toEqual(['내 프로젝트']);
    });

    it('내가 소유한 프로젝트의 COACH 만 본다', async () => {
        // 편집자(EDITOR)나 남의 프로젝트가 담당 멘토로 새어 들어오면 안 된다.
        await call();

        const args = findManyProject.mock.calls[0][0];
        expect(args.where).toEqual({ ownerId: 'mentee_1' });
        expect(args.select.members.where).toEqual({ role: 'COACH' });
    });

    it('배정된 멘토가 없으면 빈 배열이다', async () => {
        const body = await (await call()).json();

        expect(body.mentors).toEqual([]);
    });
});

describe('멘토의 소속', () => {
    beforeEach(() => authAs('MENTOR', 'mentor_1'));

    it('배정된 프로젝트를 프로그램별로 묶어 준다', async () => {
        findManyProjectMember.mockResolvedValue([
            { project: { id: 'p1', name: '프로젝트1', program: PROGRAM_ROW } },
            { project: { id: 'p2', name: '프로젝트2', program: PROGRAM_ROW } },
        ]);

        const body = await (await call()).json();

        expect(body.programs).toHaveLength(1);
        expect(body.programs[0].name).toBe('프로그램 A');
        expect(body.programs[0].projects.map((p: { name: string }) => p.name)).toEqual(['프로젝트1', '프로젝트2']);
    });

    it('COACH 로 배정된 것만 본다', async () => {
        await call();

        expect(findManyProjectMember.mock.calls[0][0].where).toEqual({ userId: 'mentor_1', role: 'COACH' });
    });

    it('배정이 없으면 빈 배열이다', async () => {
        const body = await (await call()).json();

        expect(body.programs).toEqual([]);
        expect(body.program).toBeNull();
    });
});

describe('프로그램 매니저의 소속', () => {
    beforeEach(() => authAs('PROGRAM_MANAGER', 'pm_1'));

    it('내가 개설한 프로그램과 그 프로젝트를 준다', async () => {
        findManyProgram.mockResolvedValue([
            { ...PROGRAM_ROW, projects: [{ id: 'p1', name: '프로젝트1', owner: { name: '멘티1' } }] },
        ]);

        const body = await (await call()).json();

        expect(body.programs).toHaveLength(1);
        expect(body.programs[0].projects[0]).toMatchObject({ name: '프로젝트1', ownerName: '멘티1' });
    });

    it('내가 담당인 프로그램만 본다', async () => {
        await call();

        expect(findManyProgram.mock.calls[0][0].where).toEqual({ managerId: 'pm_1' });
    });

    it('소유자 이름이 없어도 깨지지 않는다', async () => {
        findManyProgram.mockResolvedValue([
            { ...PROGRAM_ROW, projects: [{ id: 'p1', name: '프로젝트1', owner: null }] },
        ]);

        const body = await (await call()).json();

        expect(body.programs[0].projects[0].ownerName).toBeNull();
    });
});

describe('관리자', () => {
    it('프로그램에 소속되지 않으므로 빈 값을 준다', async () => {
        // 관리자는 독립적인 관리자 역할만 한다. 소속 절을 화면이 감춘다.
        authAs('ADMIN', 'admin_1');

        const body = await (await call()).json();

        expect(body).toMatchObject({ role: 'ADMIN', program: null, mentors: [], programs: [] });
        // 관리자 경로에서는 소속 조회를 아예 하지 않는다.
        expect(findManyProgram).not.toHaveBeenCalled();
        expect(findManyProjectMember).not.toHaveBeenCalled();
        expect(findManyProject).not.toHaveBeenCalled();
    });
});

describe('역할별 조회 경로가 섞이지 않는다', () => {
    it('멘티는 멘토·매니저 쿼리를 돌리지 않는다', async () => {
        authAs('MENTEE', 'mentee_1');

        await call();

        expect(findManyProjectMember).not.toHaveBeenCalled();
        expect(findManyProgram).not.toHaveBeenCalled();
    });

    it('멘토는 멘티·매니저 쿼리를 돌리지 않는다', async () => {
        authAs('MENTOR', 'mentor_1');

        await call();

        expect(findManyProject).not.toHaveBeenCalled();
        expect(findManyProgram).not.toHaveBeenCalled();
    });

    it('매니저는 멘티·멘토 쿼리를 돌리지 않는다', async () => {
        authAs('PROGRAM_MANAGER', 'pm_1');

        await call();

        expect(findManyProject).not.toHaveBeenCalled();
        expect(findManyProjectMember).not.toHaveBeenCalled();
    });
});
