// 프로젝트 생성 권한과 목록 조회 범위가 역할을 따르는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findManyProject = vi.fn();
const createProject = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findMany: findManyProject, create: createProject },
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

beforeEach(() => {
    findManyProject.mockResolvedValue([]);
    createProject.mockResolvedValue({
        id: 'proj_new', name: '새 과제', description: null, detailedDescription: null,
        aiMode: 'rule', createdAt: new Date(), updatedAt: new Date(),
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('프로젝트 생성 권한', () => {
    it('멘티는 만들 수 있다', async () => {
        authAs('MENTEE');

        const res = await POST(postRequest({ name: '새 과제' }));

        expect(res.status).toBe(200);
        expect(createProject).toHaveBeenCalled();
    });

    it('관리자는 만들 수 있다', async () => {
        authAs('ADMIN');

        const res = await POST(postRequest({ name: '새 과제' }));

        expect(res.status).toBe(200);
    });

    it('멘토는 만들 수 없다', async () => {
        // 멘티가 과제를 만들고 멘토가 붙는 구조다.
        authAs('MENTOR');

        const res = await POST(postRequest({ name: '새 과제' }));

        expect(res.status).toBe(403);
        expect(createProject).not.toHaveBeenCalled();
    });

    it('매니저는 만들 수 없다', async () => {
        authAs('PROGRAM_MANAGER');

        const res = await POST(postRequest({ name: '새 과제' }));

        expect(res.status).toBe(403);
        expect(createProject).not.toHaveBeenCalled();
    });
});

describe('프로젝트 목록 범위', () => {
    it('멘티는 소유·참여한 것만 본다', async () => {
        authAs('MENTEE', 'mentee_1');

        await GET(new NextRequest('http://localhost/api/projects'));

        const where = findManyProject.mock.calls[0][0].where;
        expect(where.OR).toBeDefined();
    });

    it('관리자는 전체를 본다', async () => {
        authAs('ADMIN', 'admin_1');

        await GET(new NextRequest('http://localhost/api/projects'));

        const where = findManyProject.mock.calls[0][0].where;
        expect(where.OR).toBeUndefined();
    });

    it('매니저는 전체를 본다', async () => {
        authAs('PROGRAM_MANAGER', 'pm_1');

        await GET(new NextRequest('http://localhost/api/projects'));

        const where = findManyProject.mock.calls[0][0].where;
        expect(where.OR).toBeUndefined();
    });

    it('멘토는 소유·참여한 것만 본다', async () => {
        authAs('MENTOR', 'mentor_1');

        await GET(new NextRequest('http://localhost/api/projects'));

        const where = findManyProject.mock.calls[0][0].where;
        expect(where.OR).toBeDefined();
    });
});
