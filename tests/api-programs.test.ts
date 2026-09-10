// 프로그램 개설·목록이 역할 게이트와 조회 범위를 지키는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findManyProgram = vi.fn();
const createProgram = vi.fn();
const findManager = vi.fn();
const listManagers = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        program: { findMany: findManyProgram, create: createProgram },
        user: { findUnique: findManager, findMany: listManagers },
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const { GET, POST } = await import('../app/api/programs/route');

function authAs(role: string, userId = 'user_1') {
    requireAuth.mockResolvedValue({
        userId, email: 'u@x.com', name: '사용자', isAdmin: role === 'ADMIN', role, accessExpiresAt: null,
    });
}

function postRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const validBody = {
    name: '2026 하반기 스타트업 육성', organization: '가나기술원',
    startsAt: '2026-09-01', endsAt: '2027-02-28',
};

beforeEach(() => {
    findManager.mockResolvedValue({ role: 'PROGRAM_MANAGER', status: 'APPROVED', accessExpiresAt: null });
    listManagers.mockResolvedValue([]);
    findManyProgram.mockResolvedValue([]);
    createProgram.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data, createdAt: new Date(),
    }));
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('프로그램 개설 권한', () => {
    it('관리자는 개설할 수 있다', async () => {
        authAs('ADMIN');

        const res = await POST(postRequest(validBody));

        expect(res.status).toBe(200);
        expect(createProgram).toHaveBeenCalled();
    });

    it('매니저는 프로그램을 개설할 수 없다', async () => {
        authAs('PROGRAM_MANAGER');

        const res = await POST(postRequest(validBody));

        expect(res.status).toBe(403);
        expect(createProgram).not.toHaveBeenCalled();
    });

    it('멘토는 개설할 수 없다', async () => {
        authAs('MENTOR');

        const res = await POST(postRequest(validBody));

        expect(res.status).toBe(403);
        expect(createProgram).not.toHaveBeenCalled();
    });

    it('멘티는 개설할 수 없다', async () => {
        authAs('MENTEE');

        const res = await POST(postRequest(validBody));

        expect(res.status).toBe(403);
    });
});

describe('프로그램 개설 규칙', () => {
    beforeEach(() => authAs('ADMIN', 'pm_1'));

    it('관리자가 고른 매니저에게 새 프로그램 운영을 배정한다', async () => {
        expect((await POST(postRequest({ ...validBody, managerId: 'manager' }))).status).toBe(200);
        expect(createProgram.mock.calls[0][0].data.managerId).toBe('manager');
    });

    it.each([
        null,
        { role: 'MENTEE', status: 'APPROVED' },
        { role: 'MENTOR', status: 'APPROVED' },
        { role: 'PROGRAM_MANAGER', status: 'PENDING' },
        { role: 'PROGRAM_MANAGER', status: 'APPROVED', accessExpiresAt: new Date('2000-01-01') },
    ])('유효하지 않은 담당자는 지정하지 않는다 (%j)', async manager => {
        findManager.mockResolvedValue(manager);
        expect((await POST(postRequest({ ...validBody, managerId: 'manager' }))).status).toBe(400);
        expect(createProgram).not.toHaveBeenCalled();
    });

    it('개설한 사람이 담당 매니저가 된다', async () => {
        await POST(postRequest(validBody));

        expect(createProgram.mock.calls[0][0].data.managerId).toBe('pm_1');
    });

    it('종료일이 시작일보다 앞이면 막는다', async () => {
        const res = await POST(postRequest({ ...validBody, startsAt: '2027-01-01', endsAt: '2026-01-01' }));

        expect(res.status).toBe(400);
        expect(createProgram).not.toHaveBeenCalled();
    });

    it('종료일이 시작일과 같으면 막는다', async () => {
        const res = await POST(postRequest({ ...validBody, startsAt: '2026-09-01', endsAt: '2026-09-01' }));

        expect(res.status).toBe(400);
    });

    it('프로그램명이 없으면 막는다', async () => {
        const res = await POST(postRequest({ ...validBody, name: '' }));

        expect(res.status).toBe(400);
        expect(createProgram).not.toHaveBeenCalled();
    });

    it('주관기관명이 없으면 막는다', async () => {
        const res = await POST(postRequest({ ...validBody, organization: '' }));

        expect(res.status).toBe(400);
    });
});

describe('프로그램 목록 범위', () => {
    it('관리자만 담당 매니저 후보를 조회한다', async () => {
        authAs('PROGRAM_MANAGER');
        expect((await GET(new NextRequest('http://localhost/api/programs?managers=1'))).status).toBe(403);
        expect(listManagers).not.toHaveBeenCalled();
        authAs('ADMIN');
        expect((await GET(new NextRequest('http://localhost/api/programs?managers=1'))).status).toBe(200);
        expect(listManagers.mock.calls[0][0].where).toMatchObject({ role: 'PROGRAM_MANAGER', status: 'APPROVED' });
    });
    it('관리자는 전체를 본다', async () => {
        authAs('ADMIN');

        await GET(new NextRequest('http://localhost/api/programs'));

        expect(findManyProgram.mock.calls[0][0].where).toEqual({});
    });

    it('매니저는 자신이 개설한 프로그램만 본다', async () => {
        authAs('PROGRAM_MANAGER', 'pm_1');

        await GET(new NextRequest('http://localhost/api/programs'));

        expect(findManyProgram.mock.calls[0][0].where).toEqual({ managerId: 'pm_1' });
    });

    it('멘토는 볼 수 없다', async () => {
        authAs('MENTOR');

        const res = await GET(new NextRequest('http://localhost/api/programs'));

        expect(res.status).toBe(403);
    });

    it('멘티는 볼 수 없다', async () => {
        authAs('MENTEE');

        const res = await GET(new NextRequest('http://localhost/api/programs'));

        expect(res.status).toBe(403);
    });
});
