// 멘토 배정이 역할 게이트를 지키고 대상 역할을 검사하는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueUser = vi.fn();
const findUniqueProject = vi.fn();
const findUniqueMember = vi.fn();
const createMember = vi.fn();
const deleteMember = vi.fn();
const findManyMember = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUniqueUser },
        project: { findUnique: findUniqueProject },
        projectMember: {
            findUnique: findUniqueMember, create: createMember,
            delete: deleteMember, findMany: findManyMember,
        },
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const { GET, POST, DELETE } = await import('../app/api/projects/[id]/mentors/route');

const params = { params: Promise.resolve({ id: 'proj_1' }) };

function authAs(role: string) {
    requireAuth.mockResolvedValue({
        userId: 'actor_1', email: 'a@x.com', name: '실행자',
        isAdmin: role === 'ADMIN', role, accessExpiresAt: null,
    });
}

function jsonRequest(method: string, body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/proj_1/mentors', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    findUniqueProject.mockResolvedValue({ id: 'proj_1' });
    findUniqueUser.mockResolvedValue({ id: 'mentor_1', role: 'MENTOR', name: '멘토', email: 'm@x.com' });
    findUniqueMember.mockResolvedValue(null);
    createMember.mockResolvedValue({ id: 'pm_1' });
    deleteMember.mockResolvedValue({ id: 'pm_1' });
    findManyMember.mockResolvedValue([]);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('멘토 배정 권한', () => {
    it('매니저는 배정할 수 있다', async () => {
        authAs('PROGRAM_MANAGER');

        const res = await POST(jsonRequest('POST', { userId: 'mentor_1' }), params);

        expect(res.status).toBe(200);
        expect(createMember).toHaveBeenCalled();
    });

    it('관리자는 배정할 수 있다', async () => {
        authAs('ADMIN');

        const res = await POST(jsonRequest('POST', { userId: 'mentor_1' }), params);

        expect(res.status).toBe(200);
    });

    it('멘토는 배정할 수 없다', async () => {
        authAs('MENTOR');

        const res = await POST(jsonRequest('POST', { userId: 'mentor_1' }), params);

        expect(res.status).toBe(403);
        expect(createMember).not.toHaveBeenCalled();
    });

    it('멘티는 배정할 수 없다', async () => {
        authAs('MENTEE');

        const res = await POST(jsonRequest('POST', { userId: 'mentor_1' }), params);

        expect(res.status).toBe(403);
    });
});

describe('배정 대상 역할', () => {
    beforeEach(() => authAs('ADMIN'));

    it('COACH 로 기록한다', async () => {
        // 새 프로젝트 역할을 만들지 않는다. COACH 는 이미 읽기 전용이다.
        await POST(jsonRequest('POST', { userId: 'mentor_1' }), params);

        expect(createMember.mock.calls[0][0].data.role).toBe('COACH');
    });

    it('매니저도 멘토로 배정할 수 있다', async () => {
        // 매니저는 멘토에서 승격되므로 겸직이 성립해야 한다.
        findUniqueUser.mockResolvedValue({ id: 'pm_2', role: 'PROGRAM_MANAGER', name: '매니저', email: 'p@x.com' });

        const res = await POST(jsonRequest('POST', { userId: 'pm_2' }), params);

        expect(res.status).toBe(200);
    });

    it('멘티는 멘토로 배정할 수 없다', async () => {
        findUniqueUser.mockResolvedValue({ id: 'mentee_1', role: 'MENTEE', name: '멘티', email: 'e@x.com' });

        const res = await POST(jsonRequest('POST', { userId: 'mentee_1' }), params);

        expect(res.status).toBe(400);
        expect(createMember).not.toHaveBeenCalled();
    });

    it('이미 배정된 사람은 중복 배정하지 않는다', async () => {
        findUniqueMember.mockResolvedValue({ id: 'pm_existing', role: 'COACH' });

        const res = await POST(jsonRequest('POST', { userId: 'mentor_1' }), params);

        expect(res.status).toBe(409);
        expect(createMember).not.toHaveBeenCalled();
    });
});

describe('배정 해제', () => {
    beforeEach(() => authAs('PROGRAM_MANAGER'));

    it('매니저가 해제할 수 있다', async () => {
        findUniqueMember.mockResolvedValue({ id: 'pm_1', role: 'COACH' });

        const res = await DELETE(jsonRequest('DELETE', { userId: 'mentor_1' }), params);

        expect(res.status).toBe(200);
        expect(deleteMember).toHaveBeenCalled();
    });

    it('소유자는 해제 대상이 아니다', async () => {
        // 해제는 배정된 멘토(COACH)만 대상으로 한다.
        findUniqueMember.mockResolvedValue({ id: 'pm_1', role: 'EDITOR' });

        const res = await DELETE(jsonRequest('DELETE', { userId: 'editor_1' }), params);

        expect(res.status).toBe(400);
        expect(deleteMember).not.toHaveBeenCalled();
    });
});

describe('배정 목록', () => {
    it('멘티는 목록을 볼 수 없다', async () => {
        authAs('MENTEE');

        const res = await GET(new NextRequest('http://localhost/api/projects/proj_1/mentors'), params);

        expect(res.status).toBe(403);
    });
});
