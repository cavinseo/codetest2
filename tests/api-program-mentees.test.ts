// 프로그램 소속 멘티 목록 — 새 프로젝트의 소유자 후보를 고르는 데 쓴다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueProgram = vi.fn();
const findManyUser = vi.fn();
const findUniqueUser = vi.fn();
const updateUser = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        program: { findUnique: findUniqueProgram },
        user: { findMany: findManyUser, findUnique: findUniqueUser, update: updateUser },
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const { GET, POST } = await import('../app/api/programs/[id]/mentees/route');

function authAs(role: string, userId = 'user_1') {
    requireAuth.mockResolvedValue({
        userId, email: 'u@x.com', name: '사용자', isAdmin: role === 'ADMIN', role, accessExpiresAt: null,
    });
}

function getRequest(query = ''): NextRequest {
    return new NextRequest(`http://localhost/api/programs/prog_1/mentees${query}`);
}

function call(query = '') {
    return GET(getRequest(query), { params: Promise.resolve({ id: 'prog_1' }) });
}

function callPost(body: unknown) {
    const req = new NextRequest('http://localhost/api/programs/prog_1/mentees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return POST(req, { params: Promise.resolve({ id: 'prog_1' }) });
}

beforeEach(() => {
    findUniqueProgram.mockResolvedValue({ id: 'prog_1', name: '새 프로그램', managerId: 'user_1' });
    findManyUser.mockResolvedValue([{ id: 'mentee_1', name: '멘티1', email: 'm1@x.com' }]);
    findUniqueUser.mockResolvedValue({
        id: 'mentee_1', name: '멘티1', role: 'MENTEE', programId: null, program: null,
    });
    updateUser.mockResolvedValue({});
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('프로그램 멘티 목록', () => {
    it('관리자는 볼 수 있다', async () => {
        authAs('ADMIN');

        const res = await call();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.mentees).toHaveLength(1);
    });

    it('담당 매니저는 볼 수 있다', async () => {
        authAs('PROGRAM_MANAGER', 'user_1');

        const res = await call();

        expect(res.status).toBe(200);
    });

    it('다른 매니저는 볼 수 없다', async () => {
        authAs('PROGRAM_MANAGER', 'other_pm');

        const res = await call();

        expect(res.status).toBe(403);
        expect(findManyUser).not.toHaveBeenCalled();
    });

    it('멘토·멘티는 볼 수 없다', async () => {
        authAs('MENTOR');
        expect((await call()).status).toBe(403);

        authAs('MENTEE');
        expect((await call()).status).toBe(403);
    });

    it('존재하지 않는 프로그램은 404', async () => {
        authAs('ADMIN');
        findUniqueProgram.mockResolvedValue(null);

        const res = await call();

        expect(res.status).toBe(404);
    });

    it('승인된 멘티만, 그 프로그램 소속으로만 조회한다', async () => {
        authAs('ADMIN');

        await call();

        expect(findManyUser.mock.calls[0][0].where).toEqual({
            programId: 'prog_1', role: 'MENTEE', status: 'APPROVED',
        });
    });
});

describe('배정 후보 조회 (?candidates=1)', () => {
    beforeEach(() => authAs('ADMIN'));

    it('소속 없는 멘티가 빠지지 않도록 OR 로 조회한다', async () => {
        // NOT: { programId } 로 쓰면 programId 가 nullable 이라 SQL 의
        // NOT (col = x) 이 NULL 행에서 NULL 로 평가돼 통째로 빠진다. 정작
        // 배정이 가장 필요한 "아직 어느 프로그램에도 없는 멘티"가 사라진다.
        await call('?candidates=1');

        expect(findManyUser.mock.calls[0][0].where).toEqual({
            role: 'MENTEE',
            status: 'APPROVED',
            OR: [{ programId: null }, { programId: { not: 'prog_1' } }],
        });
    });

    it('현재 소속 프로그램명을 함께 준다', async () => {
        findManyUser.mockResolvedValue([
            { id: 'm1', name: '멘티1', email: 'm1@x.com', programId: 'prog_9', program: { name: '다른 프로그램' } },
            { id: 'm2', name: '멘티2', email: 'm2@x.com', programId: null, program: null },
        ]);

        const res = await call('?candidates=1');
        const body = await res.json();

        expect(body.candidates[0].programName).toBe('다른 프로그램');
        // 소속이 없으면 null 이어야 한다. 화면이 "소속 없음" 으로 구분해 보여준다.
        expect(body.candidates[1].programName).toBeNull();
    });
});

describe('멘티 배정', () => {
    it('관리자는 배정할 수 있다', async () => {
        authAs('ADMIN');

        const res = await callPost({ userId: 'mentee_1' });

        expect(res.status).toBe(200);
        expect(updateUser).toHaveBeenCalledWith({
            where: { id: 'mentee_1' }, data: { programId: 'prog_1' },
        });
    });

    it('담당 매니저는 배정할 수 있다', async () => {
        authAs('PROGRAM_MANAGER', 'user_1');

        expect((await callPost({ userId: 'mentee_1' })).status).toBe(200);
    });

    it('다른 매니저는 배정할 수 없다', async () => {
        authAs('PROGRAM_MANAGER', 'other_pm');

        const res = await callPost({ userId: 'mentee_1' });

        expect(res.status).toBe(403);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('멘토·멘티는 배정할 수 없다', async () => {
        authAs('MENTOR');
        expect((await callPost({ userId: 'mentee_1' })).status).toBe(403);

        authAs('MENTEE');
        expect((await callPost({ userId: 'mentee_1' })).status).toBe(403);

        expect(updateUser).not.toHaveBeenCalled();
    });

    it('소속 없는 멘티는 확인 없이 바로 배정한다', async () => {
        // 빼앗는 것이 아니라서 확인을 받을 상대가 없다.
        authAs('ADMIN');

        const res = await callPost({ userId: 'mentee_1' });

        expect(res.status).toBe(200);
        expect(updateUser).toHaveBeenCalled();
    });

    it('다른 프로그램 소속이면 확인 없이는 409 로 멈춘다', async () => {
        authAs('ADMIN');
        findUniqueUser.mockResolvedValue({
            id: 'mentee_1', name: '멘티1', role: 'MENTEE',
            programId: 'prog_old', program: { name: '이전 프로그램' },
        });

        const res = await callPost({ userId: 'mentee_1' });
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsReassignConfirm).toBe(true);
        expect(body.currentProgramName).toBe('이전 프로그램');
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('확인을 받으면 다른 프로그램에서도 옮겨온다', async () => {
        authAs('ADMIN');
        findUniqueUser.mockResolvedValue({
            id: 'mentee_1', name: '멘티1', role: 'MENTEE',
            programId: 'prog_old', program: { name: '이전 프로그램' },
        });

        const res = await callPost({ userId: 'mentee_1', confirmReassign: true });

        expect(res.status).toBe(200);
        expect(updateUser).toHaveBeenCalledWith({
            where: { id: 'mentee_1' }, data: { programId: 'prog_1' },
        });
    });

    it('이미 이 프로그램 소속이면 400', async () => {
        authAs('ADMIN');
        findUniqueUser.mockResolvedValue({
            id: 'mentee_1', name: '멘티1', role: 'MENTEE',
            programId: 'prog_1', program: { name: '새 프로그램' },
        });

        const res = await callPost({ userId: 'mentee_1' });

        expect(res.status).toBe(400);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('멘티가 아니면 배정할 수 없다', async () => {
        // 멘토는 여러 프로그램의 프로젝트에 배정될 수 있어 한 프로그램에 묶지 않는다.
        authAs('ADMIN');
        findUniqueUser.mockResolvedValue({
            id: 'mentor_1', name: '멘토1', role: 'MENTOR', programId: null, program: null,
        });

        const res = await callPost({ userId: 'mentor_1' });

        expect(res.status).toBe(400);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('없는 회원은 404', async () => {
        authAs('ADMIN');
        findUniqueUser.mockResolvedValue(null);

        expect((await callPost({ userId: 'nobody' })).status).toBe(404);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('없는 프로그램은 404', async () => {
        authAs('ADMIN');
        findUniqueProgram.mockResolvedValue(null);

        expect((await callPost({ userId: 'mentee_1' })).status).toBe(404);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('userId 가 없으면 400', async () => {
        authAs('ADMIN');

        expect((await callPost({})).status).toBe(400);
        expect(updateUser).not.toHaveBeenCalled();
    });
});
