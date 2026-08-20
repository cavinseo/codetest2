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
const deleteUser = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUser, count: countUser, delete: deleteUser },
        project: { count: countProject },
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
    deleteUser.mockResolvedValue({ id: 'user_2' });
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
