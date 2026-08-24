// 기존 프로젝트를 다른 프로그램으로 불러오는(재배정) 라우트를 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueProgram = vi.fn();
const findUniqueProject = vi.fn();
const updateProject = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        program: { findUnique: findUniqueProgram },
        project: { findUnique: findUniqueProject, update: updateProject },
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const { POST } = await import('../app/api/programs/[id]/projects/route');

function authAs(role: string, userId = 'user_1') {
    requireAuth.mockResolvedValue({
        userId, email: 'u@x.com', name: '사용자', isAdmin: role === 'ADMIN', role, accessExpiresAt: null,
    });
}

function postRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/programs/prog_target/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function call(body: unknown) {
    return POST(postRequest(body), { params: Promise.resolve({ id: 'prog_target' }) });
}

beforeEach(() => {
    findUniqueProgram.mockResolvedValue({ id: 'prog_target', name: '새 프로그램', managerId: 'user_1' });
    findUniqueProject.mockResolvedValue({
        id: 'proj_1', name: '스마트 IoT 센서 개발', programId: 'prog_old',
        program: { name: '미분류' },
    });
    updateProject.mockResolvedValue({});
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('프로젝트 불러오기 권한', () => {
    it('관리자는 불러올 수 있다', async () => {
        authAs('ADMIN');

        const res = await call({ projectId: 'proj_1', confirmReassign: true });

        expect(res.status).toBe(200);
        expect(updateProject).toHaveBeenCalled();
    });

    it('담당 매니저는 불러올 수 있다', async () => {
        authAs('PROGRAM_MANAGER', 'user_1');

        const res = await call({ projectId: 'proj_1', confirmReassign: true });

        expect(res.status).toBe(200);
    });

    it('다른 매니저는 불러올 수 없다', async () => {
        authAs('PROGRAM_MANAGER', 'other_pm');

        const res = await call({ projectId: 'proj_1', confirmReassign: true });

        expect(res.status).toBe(403);
        expect(updateProject).not.toHaveBeenCalled();
    });

    it('멘토·멘티는 불러올 수 없다', async () => {
        authAs('MENTOR');
        expect((await call({ projectId: 'proj_1' })).status).toBe(403);

        authAs('MENTEE');
        expect((await call({ projectId: 'proj_1' })).status).toBe(403);

        expect(updateProject).not.toHaveBeenCalled();
    });
});

describe('프로젝트 불러오기 규칙', () => {
    beforeEach(() => authAs('ADMIN'));

    it('대상 프로그램이 없으면 404', async () => {
        findUniqueProgram.mockResolvedValue(null);

        const res = await call({ projectId: 'proj_1' });

        expect(res.status).toBe(404);
        expect(updateProject).not.toHaveBeenCalled();
    });

    it('대상 프로젝트가 없으면 404', async () => {
        findUniqueProject.mockResolvedValue(null);

        const res = await call({ projectId: 'proj_missing' });

        expect(res.status).toBe(404);
        expect(updateProject).not.toHaveBeenCalled();
    });

    it('이미 이 프로그램 소속이면 400 으로 막는다', async () => {
        findUniqueProject.mockResolvedValue({
            id: 'proj_1', name: '스마트 IoT 센서 개발', programId: 'prog_target',
            program: { name: '새 프로그램' },
        });

        const res = await call({ projectId: 'proj_1' });

        expect(res.status).toBe(400);
        expect(updateProject).not.toHaveBeenCalled();
    });

    it('다른 프로그램 소속이면 확인 없이는 409 로 멈춘다', async () => {
        const res = await call({ projectId: 'proj_1' });
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsReassignConfirm).toBe(true);
        expect(body.currentProgramName).toBe('미분류');
        expect(updateProject).not.toHaveBeenCalled();
    });

    it('확인을 받으면 프로그램을 바꾼다', async () => {
        await call({ projectId: 'proj_1', confirmReassign: true });

        expect(updateProject).toHaveBeenCalledWith({
            where: { id: 'proj_1' },
            data: { programId: 'prog_target' },
        });
    });

    it('projectId 가 없으면 400', async () => {
        const res = await call({});

        expect(res.status).toBe(400);
        expect(updateProject).not.toHaveBeenCalled();
    });
});
