// 관리자 사용자 삭제가 되돌릴 수 없는 연쇄 삭제를 말없이 실행하지 않는지 확인한다.
//
// User 삭제는 Project.ownerId 의 onDelete: Cascade 를 타고 그 사람이 소유한
// 프로젝트 전체와 하위 22개 모델을 지운다. 그 프로젝트에 참여한 다른 사람의
// 작업물까지 함께 사라진다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findUser = vi.fn();
const countUser = vi.fn();
const countProject = vi.fn();
const findManyProject = vi.fn();
const updateProject = vi.fn();
const deleteUser = vi.fn();
const transaction = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUser, count: countUser, delete: deleteUser },
        project: { count: countProject, findMany: findManyProject, update: updateProject },
        $transaction: (arg: unknown) => transaction(arg),
    },
}));

const requireAdmin = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireAdmin: (...args: unknown[]) => requireAdmin(...(args as [])),
}));

const { DELETE } = await import('../app/api/admin/users/route');

const ADMIN = { userId: 'admin_1', email: 'admin@ks-qfd.com', name: '관리자' };

function deleteRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    requireAdmin.mockResolvedValue(ADMIN);
    findUser.mockResolvedValue({ id: 'user_2', email: 'member@x.com', isAdmin: false });
    countUser.mockResolvedValue(2);
    countProject.mockResolvedValue(0);
    findManyProject.mockResolvedValue([]);
    updateProject.mockResolvedValue({});
    deleteUser.mockResolvedValue({ id: 'user_2' });
    // 배열 형태(prisma.$transaction([...]))로 호출한다. 각 원소는 이미 호출된
    // 쿼리의 Promise 이므로 그대로 기다리기만 하면 실제 트랜잭션과 같은 결과다.
    transaction.mockImplementation(async (ops: unknown) => Promise.all(ops as Promise<unknown>[]));
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('admin users DELETE', () => {
    it('소유 프로젝트가 있으면 409 로 막고 건수를 알려준다', async () => {
        countProject.mockResolvedValue(3);

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.ownedProjects).toBe(3);
        expect(body.error).toContain('프로젝트 3개');
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('확인을 받으면 삭제한다', async () => {
        countProject.mockResolvedValue(3);

        const res = await DELETE(deleteRequest({ userId: 'user_2', confirmCascade: true }));

        expect(res.status).toBe(200);
        expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'user_2' } });
    });

    it('소유 프로젝트가 없으면 확인 없이 삭제한다', async () => {
        const res = await DELETE(deleteRequest({ userId: 'user_2' }));

        expect(res.status).toBe(200);
        expect(deleteUser).toHaveBeenCalledTimes(1);
    });

    it('본인 계정은 삭제할 수 없다', async () => {
        findUser.mockResolvedValue({ id: ADMIN.userId, email: ADMIN.email, isAdmin: true });

        const res = await DELETE(deleteRequest({ userId: ADMIN.userId, confirmCascade: true }));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toContain('본인 계정');
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('마지막 관리자는 삭제할 수 없다', async () => {
        findUser.mockResolvedValue({ id: 'admin_2', email: 'other@x.com', isAdmin: true });
        countUser.mockResolvedValue(1);

        const res = await DELETE(deleteRequest({ userId: 'admin_2', confirmCascade: true }));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toContain('마지막 관리자');
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('관리자가 둘 이상이면 관리자도 삭제할 수 있다', async () => {
        findUser.mockResolvedValue({ id: 'admin_2', email: 'other@x.com', isAdmin: true });
        countUser.mockResolvedValue(2);

        const res = await DELETE(deleteRequest({ userId: 'admin_2', confirmCascade: true }));

        expect(res.status).toBe(200);
        expect(deleteUser).toHaveBeenCalled();
    });

    it('FK 제약에 걸리면 500 이 아니라 409 로 이유를 알려준다', async () => {
        deleteUser.mockRejectedValue(Object.assign(new Error('FK'), { code: 'P2003' }));

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.error).toContain('설문 발송');
    });

    it('관리자가 아니면 삭제 경로에 들어가지 못한다', async () => {
        requireAdmin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }));

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));

        expect(res.status).toBe(403);
        expect(deleteUser).not.toHaveBeenCalled();
    });
});

describe('멘티 삭제: 프로젝트는 지워지지 않고 프로그램 매니저에게 넘어간다', () => {
    beforeEach(() => {
        findUser.mockResolvedValue({ id: 'user_2', email: 'mentee@x.com', isAdmin: false, role: 'MENTEE' });
    });

    it('소유한 프로젝트를 그 프로그램의 매니저에게 넘긴다', async () => {
        findManyProject.mockResolvedValue([
            { id: 'proj_a', program: { managerId: 'pm_a' } },
            { id: 'proj_b', program: { managerId: 'pm_b' } },
        ]);

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.transferredProjects).toBe(2);
        expect(updateProject).toHaveBeenCalledWith({ where: { id: 'proj_a' }, data: { ownerId: 'pm_a' } });
        expect(updateProject).toHaveBeenCalledWith({ where: { id: 'proj_b' }, data: { ownerId: 'pm_b' } });
        expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'user_2' } });
    });

    it('소유한 프로젝트가 없어도 정상적으로 삭제한다', async () => {
        findManyProject.mockResolvedValue([]);

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.transferredProjects).toBe(0);
        expect(updateProject).not.toHaveBeenCalled();
        expect(deleteUser).toHaveBeenCalled();
    });

    it('확인을 요구하지 않고 바로 처리한다', async () => {
        // 파괴적인 조작이 아니다 — 프로젝트가 사라지는 게 아니라 소유자만
        // 바뀐다. 그래서 다른 역할과 달리 confirmCascade 를 요구하지 않는다.
        findManyProject.mockResolvedValue([{ id: 'proj_a', program: { managerId: 'pm_a' } }]);

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));

        expect(res.status).not.toBe(409);
        const body = await res.json();
        expect(body.needsCascadeConfirm).toBeUndefined();
    });

    it('멘티가 아닌 역할은 이 경로를 타지 않는다', async () => {
        // 회귀 확인: 소유 프로젝트가 있는 멘토는 여전히 기존 cascade-confirm
        // 흐름(409)을 거쳐야 한다. 멘티 분기가 다른 역할까지 삼키면 안 된다.
        findUser.mockResolvedValue({ id: 'user_2', email: 'mentor@x.com', isAdmin: false, role: 'MENTOR' });
        countProject.mockResolvedValue(2);

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(updateProject).not.toHaveBeenCalled();
        expect(deleteUser).not.toHaveBeenCalled();
    });
});
