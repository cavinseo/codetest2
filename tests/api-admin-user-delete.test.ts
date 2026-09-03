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
const countInvitation = vi.fn();
const countMigration = vi.fn();
const countInviteCode = vi.fn();
const deleteManyInviteCode = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUser, count: countUser, delete: deleteUser },
        project: { count: countProject, findMany: findManyProject, update: updateProject },
        kanoSurveyInvitation: { count: countInvitation },
        migrationHistory: { count: countMigration },
        inviteCode: { count: countInviteCode, deleteMany: deleteManyInviteCode },
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
    countInvitation.mockResolvedValue(0);
    countMigration.mockResolvedValue(0);
    countInviteCode.mockResolvedValue(0);
    deleteManyInviteCode.mockResolvedValue({ count: 0 });
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

    it('담당 프로그램 때문에 막히면 담당자 이관을 안내한다', async () => {
        // 사람을 지우는 게 아니라 담당자를 옮겨야 풀리는 경우다. 예전에는 원인과
        // 무관하게 설문 이력을 탓해 엉뚱한 곳을 보게 했다.
        deleteUser.mockRejectedValue(Object.assign(new Error('FK'), {
            code: 'P2003',
            meta: { field_name: 'programs_managerId_fkey (index)' },
        }));

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.error).toContain('담당자');
        expect(body.error).not.toContain('설문 발송');
    });

    it('그 밖의 FK 제약은 500 이 아니라 409 로 알린다', async () => {
        deleteUser.mockRejectedValue(Object.assign(new Error('FK'), { code: 'P2003' }));

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.error).toContain('승인을 취소');
    });

    it('관리자가 아니면 삭제 경로에 들어가지 못한다', async () => {
        requireAdmin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }));

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));

        expect(res.status).toBe(403);
        expect(deleteUser).not.toHaveBeenCalled();
    });
});

describe('멘티 삭제: 지우기 전에 무엇이 벌어지는지 보여 준다', () => {
    const CONFIRMED = { userId: 'user_2', confirmCascade: true, reason: 'self_request' };

    beforeEach(() => {
        findUser.mockResolvedValue({ id: 'user_2', email: 'Mentee@x.com', isAdmin: false, role: 'MENTEE' });
        findManyProject.mockResolvedValue([
            { id: 'proj_a', name: '스마트팜', program: { managerId: 'pm_a', manager: { name: '김매니저' } } },
        ]);
    });

    it('확인 없이는 지우지 않고 사전 점검 결과를 돌려준다', async () => {
        countInvitation.mockResolvedValue(3);
        countMigration.mockResolvedValue(2);
        countInviteCode.mockResolvedValue(1);

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.preview.transferProjects).toEqual([
            { id: 'proj_a', name: '스마트팜', managerName: '김매니저' },
        ]);
        expect(body.preview.invitations).toBe(3);
        expect(body.preview.migrations).toBe(2);
        expect(body.preview.inviteCodes).toBe(1);
        expect(deleteUser).not.toHaveBeenCalled();
        expect(updateProject).not.toHaveBeenCalled();
        expect(deleteManyInviteCode).not.toHaveBeenCalled();
    });

    it('사유가 없으면 확인했더라도 지우지 않는다', async () => {
        // 사유는 파기의 증빙이다. 없이 지우면 나중에 왜 지웠는지 답할 수 없다.
        const res = await DELETE(deleteRequest({ userId: 'user_2', confirmCascade: true }));

        expect(res.status).toBe(400);
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('알 수 없는 사유도 거부한다', async () => {
        const res = await DELETE(deleteRequest({ userId: 'user_2', confirmCascade: true, reason: '그냥' }));

        expect(res.status).toBe(400);
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('확인과 사유가 있으면 프로젝트를 넘기고 초대 코드를 지운 뒤 삭제한다', async () => {
        const res = await DELETE(deleteRequest(CONFIRMED));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.transferredProjects).toBe(1);
        expect(updateProject).toHaveBeenCalledWith({ where: { id: 'proj_a' }, data: { ownerId: 'pm_a' } });
        expect(deleteManyInviteCode).toHaveBeenCalledWith({
            where: { email: { equals: 'Mentee@x.com', mode: 'insensitive' } },
        });
        expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'user_2' } });
    });

    it('초대 코드 삭제가 사용자 삭제보다 먼저다', async () => {
        // 순서가 뒤집히면 usedById 가 먼저 SetNull 이 돼 어느 코드가 그 사람의
        // 것이었는지 알 수 없게 된다. 트랜잭션 배열의 순서로 고정한다.
        await DELETE(deleteRequest(CONFIRMED));

        const ops = transaction.mock.calls[0][0] as unknown[];
        expect(ops).toHaveLength(3);
        const [transferAt] = updateProject.mock.invocationCallOrder;
        const [codesAt] = deleteManyInviteCode.mock.invocationCallOrder;
        const [userAt] = deleteUser.mock.invocationCallOrder;
        expect(transferAt).toBeLessThan(codesAt);
        expect(codesAt).toBeLessThan(userAt);
    });

    it('이력 건수를 응답에 담아 무엇이 익명화됐는지 알린다', async () => {
        countInvitation.mockResolvedValue(3);
        countMigration.mockResolvedValue(2);
        countInviteCode.mockResolvedValue(1);

        const res = await DELETE(deleteRequest(CONFIRMED));
        const body = await res.json();

        expect(body.anonymizedInvitations).toBe(3);
        expect(body.anonymizedMigrations).toBe(2);
        expect(body.deletedInviteCodes).toBe(1);
    });

    it('소유한 프로젝트가 없어도 삭제한다', async () => {
        findManyProject.mockResolvedValue([]);

        const res = await DELETE(deleteRequest(CONFIRMED));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.transferredProjects).toBe(0);
        expect(updateProject).not.toHaveBeenCalled();
        expect(deleteUser).toHaveBeenCalled();
    });

    it('응답에 이메일을 담지 않는다', async () => {
        const res = await DELETE(deleteRequest(CONFIRMED));
        const text = await res.text();

        expect(text).not.toContain('Mentee@x.com');
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
        expect(body.preview).toBeUndefined();
        expect(deleteUser).not.toHaveBeenCalled();
    });
});
