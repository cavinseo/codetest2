// 관리자의 회원 삭제. 멘티와 그 밖의 역할은 삭제 영향이 달라 갈래가 둘이지만, 트랜잭션의 뼈대
// (교차 삭제 잠금 → 영향 재확인 → 발급한 초대 코드 이전 → 계정 삭제)는 같다.
//
// 예전에는 이 전부가 app/api/admin/users/route.ts 의 DELETE 하나에 약 200줄로 들어 있었고,
// 멘티의 삭제 영향은 미리보기와 트랜잭션 안에서 같은 조회 다섯 개를 따로 적어 계산했다
// (2026-10-25 코드 리뷰 L6). 한쪽만 고치면 미리보기 토큰이 늘 어긋나 삭제가 막힌다.
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { hasAdminAccess } from './authorization';
import { isAccessExpired, parseMemberRole } from './member-roles';
import { lockTransferUsers, ProjectTransferError, transferSnapshotToken } from './project-transfer';

// 트랜잭션 밖(미리보기)에서는 prisma 를, 안(재확인)에서는 tx 를 넘긴다. PrismaClient 는
// TransactionClient 자리에 그대로 들어간다.
type Db = Prisma.TransactionClient;

async function lockDeletionActors(tx: Prisma.TransactionClient, actorId: string, userId: string, relatedUserIds: string[] = []) {
    // 관리자 교차 삭제는 공통 잠금 뒤 같은 사용자 잠금 순서로 실행한다.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('admin-user-deletion'))::text`;
    await lockTransferUsers(tx, [actorId, userId, ...relatedUserIds]);
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (!actor || actor.status !== 'APPROVED' || isAccessExpired(actor.accessExpiresAt)
        || !hasAdminAccess({ ...actor, role: parseMemberRole(actor.role) ?? 'MENTEE' })) {
        throw new ProjectTransferError('실행 관리자 정보가 변경되었습니다. 다시 로그인한 뒤 확인하세요.', 409);
    }
    const target = await tx.user.findUnique({ where: { id: userId } });
    if (!target) throw new ProjectTransferError('회원 정보가 변경되었습니다. 다시 확인하세요.', 409);
    if (target.isAdmin && await tx.user.count({ where: { isAdmin: true } }) <= 1) {
        throw new ProjectTransferError('마지막 관리자 계정은 삭제할 수 없습니다.', 400);
    }
    return target;
}

type DeletionTarget = NonNullable<Awaited<ReturnType<typeof lockDeletionActors>>>;

/**
 * 두 갈래가 함께 쓰는 삭제 트랜잭션. prepare 에서 잠금 뒤의 현재 상태를 다시 확인하고 갈래별
 * 정리를 한다. 그다음 삭제되는 사람이 발급한 초대 코드의 관리 책임을 실행 관리자에게 넘기고
 * (건수가 확인 때와 다르면 막는다) 계정을 지운다.
 */
async function deleteUserInTransaction(params: {
    actorId: string;
    userId: string;
    transferredIssuedInviteCodes: number;
    relatedUserIds?: string[];
    prepare: (tx: Prisma.TransactionClient, current: DeletionTarget) => Promise<void>;
}) {
    const { actorId, userId, transferredIssuedInviteCodes } = params;
    await prisma.$transaction(async tx => {
        const current = await lockDeletionActors(tx, actorId, userId, params.relatedUserIds);
        await params.prepare(tx, current);
        const moved = await tx.inviteCode.updateMany({ where: { issuedById: userId }, data: { issuedById: actorId } });
        if (moved.count !== transferredIssuedInviteCodes) throw new ProjectTransferError('발급한 초대 코드가 변경되었습니다. 삭제를 다시 확인하세요.', 409);
        await tx.user.delete({ where: { id: userId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

// ─── 멘티 ──────────────────────────────────────────────────────────

/**
 * 멘티를 지우면 일어나는 일을 센다. 미리보기와 트랜잭션 안의 재확인이 같은 함수를 써야 확인
 * 토큰이 같은 기준으로 만들어진다.
 */
export async function readMenteeDeletionImpact(db: Db, userId: string, email: string) {
    const ownedProjects = await db.project.findMany({
        where: { ownerId: userId },
        select: { id: true, name: true, program: { select: { id: true, managerId: true, manager: { select: { name: true } } } } },
        orderBy: { id: 'asc' },
    });
    // 이력은 남기되 주인만 비운다(스키마의 SetNull). 몇 건이 그렇게 되는지는 확인창에도 보여 주고
    // 로그에도 남긴다.
    const [invitations, migrations, inviteCodes, transferredIssuedInviteCodes] = await Promise.all([
        db.kanoSurveyInvitation.count({ where: { invitedBy: userId } }),
        db.migrationHistory.count({ where: { userId } }),
        // 가입 때 저장된 주소와 코드 발급 때 입력한 주소의 대소문자가 다를 수 있다.
        db.inviteCode.count({ where: { email: { equals: email, mode: 'insensitive' }, issuedById: { not: userId } } }),
        db.inviteCode.count({ where: { issuedById: userId } }),
    ]);
    return { ownedProjects, invitations, migrations, inviteCodes, transferredIssuedInviteCodes };
}

export type MenteeDeletionImpact = Awaited<ReturnType<typeof readMenteeDeletionImpact>>;

export function menteeDeletionToken(user: { id: string; email: string; role: string }, impact: MenteeDeletionImpact): string {
    return transferSnapshotToken({ userId: user.id, email: user.email, role: user.role, ...impact });
}

/**
 * 멘티를 지운다. 소유 프로젝트는 지우지 않고 각 프로그램 매니저에게 넘긴다 — 프로그램은 참여
 * 멘티들의 프로젝트로 구성되므로 계정이 없어졌다고 프로젝트까지 사라지면 안 된다.
 * 잠금 뒤의 영향이 미리보기 토큰과 다르면 아무것도 바꾸지 않고 막는다.
 */
export async function deleteMentee(params: {
    actorId: string;
    target: { id: string; email: string };
    impact: MenteeDeletionImpact;
    previewToken: string;
}) {
    const { actorId, target, impact, previewToken } = params;
    const userId = target.id;
    await deleteUserInTransaction({
        actorId,
        userId,
        transferredIssuedInviteCodes: impact.transferredIssuedInviteCodes,
        relatedUserIds: impact.ownedProjects.map(p => p.program.managerId),
        prepare: async (tx, current) => {
            const programIds = [...new Set(impact.ownedProjects.map(p => p.program.id))].sort();
            if (programIds.length > 0) {
                await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "programs" WHERE "id" IN (${Prisma.join(programIds)}) ORDER BY "id" FOR SHARE`);
            }
            const currentImpact = await readMenteeDeletionImpact(tx, userId, target.email);
            if (menteeDeletionToken({ id: userId, email: current.email, role: current.role }, currentImpact) !== previewToken) {
                throw new ProjectTransferError('소유 프로젝트 또는 삭제 영향이 변경되었습니다. 삭제를 다시 요청해 확인하세요.', 409);
            }
            for (const project of impact.ownedProjects) {
                const moved = await tx.project.updateMany({
                    where: { id: project.id, ownerId: userId, programId: project.program.id },
                    data: { ownerId: project.program.managerId },
                });
                if (moved.count !== 1) throw new ProjectTransferError('프로젝트 소유자가 변경되었습니다. 삭제를 다시 확인하세요.', 409);
            }
            if (await tx.project.count({ where: { ownerId: userId } }) > 0) {
                throw new ProjectTransferError('소유 프로젝트가 변경되었습니다. 삭제를 다시 확인하세요.', 409);
            }
            // 이 사람에게 발급된 초대 코드는 목적을 다했다. 계정을 지워도 email 이 남는 유일한
            // 자리라, 사용 여부와 무관하게 함께 지운다. 사용자보다 먼저 지워야 한다 — 순서가
            // 뒤집히면 usedById 가 먼저 SetNull 이 돼 어느 코드가 그 사람의 것이었는지 알 수 없다.
            await tx.inviteCode.deleteMany({
                where: { email: { equals: target.email, mode: 'insensitive' }, issuedById: { not: userId } },
            });
        },
    });
}

// ─── 그 밖의 역할 ─────────────────────────────────────────────────────

/** 멘티가 아닌 회원을 지우면 함께 사라지는 소유 프로젝트 수와 넘겨받을 초대 코드 수. */
export async function readMemberDeletionImpact(db: Db, userId: string) {
    const ownedProjects = await db.project.count({ where: { ownerId: userId } });
    const transferredIssuedInviteCodes = await db.inviteCode.count({ where: { issuedById: userId } });
    return { ownedProjects, transferredIssuedInviteCodes };
}

/**
 * 멘티가 아닌 회원을 지운다. Project.ownerId 의 onDelete: Cascade 로 소유 프로젝트 전체가 함께
 * 지워지므로, 잠금 뒤 역할·관리자 여부·건수가 확인 때와 같을 때만 진행한다.
 */
export async function deleteMember(params: {
    actorId: string;
    target: { id: string; role: string; isAdmin: boolean };
    impact: { ownedProjects: number; transferredIssuedInviteCodes: number };
}) {
    const { actorId, target, impact } = params;
    await deleteUserInTransaction({
        actorId,
        userId: target.id,
        transferredIssuedInviteCodes: impact.transferredIssuedInviteCodes,
        prepare: async (tx, current) => {
            const currentImpact = await readMemberDeletionImpact(tx, target.id);
            if (current.role !== target.role || current.isAdmin !== target.isAdmin
                || currentImpact.ownedProjects !== impact.ownedProjects
                || currentImpact.transferredIssuedInviteCodes !== impact.transferredIssuedInviteCodes) {
                throw new ProjectTransferError('회원 또는 소유 프로젝트가 변경되었습니다. 삭제를 다시 확인하세요.', 409);
            }
        },
    });
}
