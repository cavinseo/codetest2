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
const lockUsers = vi.fn();
const findActor = vi.fn();
const transferIssuedCodes = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUser, count: countUser, delete: deleteUser },
        project: { count: countProject, findMany: findManyProject, updateMany: updateProject },
        kanoSurveyInvitation: { count: countInvitation },
        migrationHistory: { count: countMigration },
        inviteCode: { count: countInviteCode, deleteMany: deleteManyInviteCode },
        $transaction: (arg: unknown) => transaction(arg),
    },
}));

const requireAdmin = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireAdmin: (...args: unknown[]) => requireAdmin(...(args as [])),
    hasAdminAccess: (user: { role: string; isAdmin: boolean }) => user.role === 'ADMIN' && user.isAdmin,
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
    vi.resetAllMocks();
    requireAdmin.mockResolvedValue(ADMIN);
    findUser.mockResolvedValue({ id: 'user_2', email: 'member@x.com', isAdmin: false });
    countUser.mockResolvedValue(2);
    countProject.mockResolvedValue(0);
    findManyProject.mockResolvedValue([]);
    updateProject.mockResolvedValue({ count: 1 });
    deleteUser.mockResolvedValue({ id: 'user_2' });
    countInvitation.mockResolvedValue(0);
    countMigration.mockResolvedValue(0);
    countInviteCode.mockResolvedValue(0);
    deleteManyInviteCode.mockResolvedValue({ count: 0 });
    lockUsers.mockResolvedValue([]);
    findActor.mockResolvedValue({ id: 'admin_1', email: 'admin@ks-qfd.com', role: 'ADMIN', status: 'APPROVED', isAdmin: true, accessExpiresAt: null });
    transferIssuedCodes.mockImplementation(async () => ({ count: await countInviteCode({ where: { issuedById: 'user_2' } }) }));
    transaction.mockImplementation(async fn => fn({
        $queryRaw: lockUsers,
        user: { findUnique: (args: { where: { id: string } }) => args.where.id === 'admin_1' ? findActor(args) : findUser(args), count: countUser, delete: deleteUser },
        project: { count: countProject, findMany: findManyProject, updateMany: updateProject },
        kanoSurveyInvitation: { count: countInvitation }, migrationHistory: { count: countMigration },
        inviteCode: { count: countInviteCode, deleteMany: deleteManyInviteCode, updateMany: transferIssuedCodes },
    }));
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('admin users DELETE', () => {
    it('이름이 없는 발급자도 ID로 확인하고 초대 책임을 이전한 뒤 삭제한다', async () => {
        findUser.mockResolvedValue({ id: 'user_2', name: null, email: 'member@x.com', role: 'MENTOR', isAdmin: false });
        countInviteCode.mockResolvedValue(1);
        const response = await DELETE(deleteRequest({ userId: 'user_2', confirmCascade: true }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ success: true, transferredIssuedInviteCodes: 1 });
        expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'user_2' } });
    });
    it('발급자가 삭제돼도 기존 초대 코드를 실행 관리자에게 이전한다', async () => {
        countInviteCode.mockImplementation(async ({ where }) => where.issuedById ? 2 : 0);
        const preview = await DELETE(deleteRequest({ userId: 'user_2' }));
        expect(preview.status).toBe(409);
        expect((await preview.json()).transferredIssuedInviteCodes).toBe(2);
        expect(deleteUser).not.toHaveBeenCalled();
        const response = await DELETE(deleteRequest({ userId: 'user_2', confirmCascade: true }));
        expect(response.status).toBe(200); expect((await response.json()).transferredIssuedInviteCodes).toBe(2);
        expect(transferIssuedCodes).toHaveBeenCalledWith({ where: { issuedById: 'user_2' }, data: { issuedById: 'admin_1' } });
        expect(transferIssuedCodes.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0]);
    });
    it('교차 삭제로 실행 관리자 계정이 사라졌으면 다른 관리자를 삭제하지 않는다', async () => {
        findUser.mockResolvedValue({ id: 'admin_2', email: 'other@x.com', role: 'ADMIN', status: 'APPROVED', isAdmin: true });
        findActor.mockResolvedValue(null);
        expect((await DELETE(deleteRequest({ userId: 'admin_2', confirmCascade: true }))).status).toBe(409);
        expect(deleteUser).not.toHaveBeenCalled();
    });
    it('공통 관리자 삭제 잠금 뒤 현재 관리자 수를 다시 검사한다', async () => {
        findUser.mockResolvedValue({ id: 'admin_2', email: 'other@x.com', role: 'ADMIN', status: 'APPROVED', isAdmin: true });
        await DELETE(deleteRequest({ userId: 'admin_2', confirmCascade: true }));
        expect(lockUsers.mock.calls.some(call => String(call[0]).includes('pg_advisory_xact_lock') || String(call[0]?.text).includes('pg_advisory_xact_lock'))).toBe(true);
        expect(lockUsers.mock.invocationCallOrder[0]).toBeLessThan(countUser.mock.invocationCallOrder[0]);
    });
    it('잠금 이후 마지막 관리자이면 삭제를 거절한다', async () => {
        findUser.mockResolvedValue({ id: 'admin_2', email: 'other@x.com', role: 'ADMIN', status: 'APPROVED', isAdmin: true });
        countUser.mockImplementation(async () => lockUsers.mock.calls.length ? 1 : 2);
        expect((await DELETE(deleteRequest({ userId: 'admin_2', confirmCascade: true }))).status).toBe(400);
        expect(deleteUser).not.toHaveBeenCalled();
    });
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
    async function confirmedRequest() {
        const response = await DELETE(deleteRequest({ userId: 'user_2' }));
        const { preview } = await response.json();
        return deleteRequest({ ...CONFIRMED, previewToken: preview.previewToken });
    }

    beforeEach(() => {
        findUser.mockResolvedValue({ id: 'user_2', email: 'Mentee@x.com', isAdmin: false, role: 'MENTEE' });
        findManyProject.mockResolvedValue([
            { id: 'proj_a', name: '스마트팜', program: { id: 'program_a', managerId: 'pm_a', manager: { name: '김매니저' } } },
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
        const res = await DELETE(await confirmedRequest());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.transferredProjects).toBe(1);
        expect(updateProject).toHaveBeenCalledWith({ where: { id: 'proj_a', ownerId: 'user_2', programId: 'program_a' }, data: { ownerId: 'pm_a' } });
        expect(deleteManyInviteCode).toHaveBeenCalledWith({
            where: { email: { equals: 'Mentee@x.com', mode: 'insensitive' }, issuedById: { not: 'user_2' } },
        });
        expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'user_2' } });
    });

    it('초대 코드 삭제가 사용자 삭제보다 먼저다', async () => {
        // 순서가 뒤집히면 usedById 가 먼저 SetNull 이 돼 어느 코드가 그 사람의
        // 것이었는지 알 수 없게 된다. 트랜잭션의 실행 순서로 고정한다.
        await DELETE(await confirmedRequest());

        expect(transaction.mock.calls[0][0]).toBeTypeOf('function');
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

        const res = await DELETE(await confirmedRequest());
        const body = await res.json();

        expect(body.anonymizedInvitations).toBe(3);
        expect(body.anonymizedMigrations).toBe(2);
        expect(body.deletedInviteCodes).toBe(1);
    });

    it('소유한 프로젝트가 없어도 삭제한다', async () => {
        findManyProject.mockResolvedValue([]);

        const res = await DELETE(await confirmedRequest());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.transferredProjects).toBe(0);
        expect(updateProject).not.toHaveBeenCalled();
        expect(deleteUser).toHaveBeenCalled();
    });

    it('응답에 이메일을 담지 않는다', async () => {
        const res = await DELETE(await confirmedRequest());
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

    it('확인 토큰이 없는 삭제는 새 미리보기를 요구한다', async () => {
        const response = await DELETE(deleteRequest(CONFIRMED));
        expect(response.status).toBe(409);
        expect((await response.json()).needsCascadeConfirm).toBe(true);
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it.each(['빠짐', '추가'])('미리보기 이후 소유 목록에 %s이 생기면 삭제하지 않는다', async change => {
        const confirmed = await confirmedRequest();
        findManyProject.mockResolvedValue(change === '빠짐' ? [] : [
            { id: 'new', name: '이관된 프로젝트', program: { id: 'program_a', managerId: 'pm_a', manager: { name: '김매니저' } } },
        ]);
        expect((await DELETE(confirmed)).status).toBe(409);
        expect(updateProject).not.toHaveBeenCalled();
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('잠금을 기다리는 동안 소유 목록이 바뀌면 기존 소유권을 덮어쓰지 않는다', async () => {
        const confirmed = await confirmedRequest();
        findManyProject.mockResolvedValueOnce([
            { id: 'proj_a', name: '스마트팜', program: { id: 'program_a', managerId: 'pm_a', manager: { name: '김매니저' } } },
        ]).mockResolvedValueOnce([]);
        expect((await DELETE(confirmed)).status).toBe(409);
        expect(updateProject).not.toHaveBeenCalled();
        expect(deleteUser).not.toHaveBeenCalled();
        expect(lockUsers.mock.calls.some(call => JSON.stringify(call[0]?.values) === JSON.stringify(['admin_1', 'pm_a', 'user_2']))).toBe(true);
    });

    it('조건부 소유권 변경 실패 시 계정 삭제를 진행하지 않는다', async () => {
        const confirmed = await confirmedRequest();
        updateProject.mockResolvedValue({ count: 0 });
        expect((await DELETE(confirmed)).status).toBe(409);
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('토큰 검증 뒤 프로그램이 바뀌면 이전 프로그램 담당자에게 넘기지 않는다', async () => {
        const confirmed = await confirmedRequest();
        const currentProject: Record<string, string> = { id: 'proj_a', ownerId: 'user_2', programId: 'program_b' };
        updateProject.mockImplementation(async ({ where, data }) => {
            const matches = Object.entries(where).every(([key, value]) => currentProject[key] === value);
            if (matches) Object.assign(currentProject, data);
            return { count: matches ? 1 : 0 };
        });
        expect((await DELETE(confirmed)).status).toBe(409);
        expect(updateProject.mock.calls[0][0].where.programId).toBe('program_a');
        expect(currentProject.ownerId).toBe('user_2');
        expect(deleteManyInviteCode).not.toHaveBeenCalled();
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('프로젝트를 넘긴 뒤 소유 프로젝트가 남아 있으면 Cascade 삭제를 막는다', async () => {
        const confirmed = await confirmedRequest();
        countProject.mockResolvedValue(1);
        expect((await DELETE(confirmed)).status).toBe(409);
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('미리보기 뒤 익명화될 설문 건수가 바뀌면 다시 확인한다', async () => {
        const confirmed = await confirmedRequest();
        countInvitation.mockResolvedValue(1);
        expect((await DELETE(confirmed)).status).toBe(409);
        expect(deleteUser).not.toHaveBeenCalled();
    });
});
