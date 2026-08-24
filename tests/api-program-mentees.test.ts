// 프로그램 소속 멘티 목록 — 새 프로젝트의 소유자 후보를 고르는 데 쓴다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueProgram = vi.fn();
const findManyUser = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        program: { findUnique: findUniqueProgram },
        user: { findMany: findManyUser },
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const { GET } = await import('../app/api/programs/[id]/mentees/route');

function authAs(role: string, userId = 'user_1') {
    requireAuth.mockResolvedValue({
        userId, email: 'u@x.com', name: '사용자', isAdmin: role === 'ADMIN', role, accessExpiresAt: null,
    });
}

function getRequest(): NextRequest {
    return new NextRequest('http://localhost/api/programs/prog_1/mentees');
}

function call() {
    return GET(getRequest(), { params: Promise.resolve({ id: 'prog_1' }) });
}

beforeEach(() => {
    findUniqueProgram.mockResolvedValue({ managerId: 'user_1' });
    findManyUser.mockResolvedValue([{ id: 'mentee_1', name: '멘티1', email: 'm1@x.com' }]);
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
