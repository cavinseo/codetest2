// 프로젝트 소유권 이관의 영향 검증과 사용자 잠금 규칙을 관리한다.
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { isAccessExpired } from './member-roles';
import type { ProjectTransferPerson, ProjectTransferPreview } from './project-transfer-types';

export class ProjectTransferError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
    }
}

export const TRANSFER_CONFLICT = '프로젝트 또는 회원 정보가 변경되었습니다. 미리보기를 다시 확인하세요.';

export function isTransferConflictError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const dbError = error as { code?: string; meta?: { code?: string } };
    return ['P2034', 'P2025', 'P2003'].includes(dbError.code ?? '')
        || (dbError.code === 'P2010' && ['40001', '40P01'].includes(dbError.meta?.code ?? ''));
}

export function transferSnapshotToken(snapshot: unknown): string {
    return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

// 이관·계정 삭제·배정 변경은 사용자부터 같은 순서로 잠근다. 배정이 없는 멘티도 보호한다.
export async function lockTransferUsers(tx: Prisma.TransactionClient, ids: string[]) {
    const sortedIds = [...new Set(ids)].sort();
    if (sortedIds.length === 0) return;
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" IN (${Prisma.join(sortedIds)}) ORDER BY "id" FOR UPDATE`);
}

const personSelect = { id: true, name: true, email: true, role: true, status: true, accessExpiresAt: true, updatedAt: true } as const;
const ownerSelect = {
    ...personSelect,
    program: { select: { id: true, name: true } },
    mentorAssignment: { select: { mentorId: true, assignedAt: true, mentor: { select: personSelect } } },
} as const;

async function readTransferState(tx: Prisma.TransactionClient, projectId: string, targetMenteeId: string) {
    const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, ownerId: true, programId: true, updatedAt: true, program: { select: { id: true, name: true } }, owner: { select: ownerSelect } },
    });
    const target = await tx.user.findUnique({ where: { id: targetMenteeId }, select: ownerSelect });
    const targetProjects = await tx.project.findMany({ where: { ownerId: targetMenteeId }, select: { id: true }, orderBy: { id: 'asc' } });
    return { project, target, targetProjects };
}

type TransferState = Awaited<ReturnType<typeof readTransferState>>;
function publicPerson(person: ProjectTransferPerson): ProjectTransferPerson {
    return { id: person.id, name: person.name, email: person.email };
}

function buildPreview(state: TransferState): ProjectTransferPreview {
    const { project, target, targetProjects } = state;
    if (!project) throw new ProjectTransferError('프로젝트를 찾을 수 없습니다.', 404);
    if (!target) throw new ProjectTransferError('대상 멘티를 찾을 수 없습니다.', 404);
    if (project.ownerId === target.id) throw new ProjectTransferError('현재 소유자와 다른 멘티를 선택하세요.', 400);
    if (target.role !== 'MENTEE' || target.status !== 'APPROVED' || isAccessExpired(target.accessExpiresAt) || !target.program) {
        throw new ProjectTransferError('승인되고 이용 기간이 유효하며 프로그램에 소속된 멘티만 선택할 수 있습니다.', 400);
    }
    const sourceMentor = project.owner.mentorAssignment?.mentor ?? null;
    if (sourceMentor && (!['MENTOR', 'PROGRAM_MANAGER'].includes(sourceMentor.role) || sourceMentor.status !== 'APPROVED' || isAccessExpired(sourceMentor.accessExpiresAt))) {
        throw new ProjectTransferError('원본 멘티의 담당 멘토가 유효하지 않습니다. 먼저 멘토 배정을 정리하세요.', 400);
    }
    const currentTargetMentor = target.mentorAssignment?.mentor ?? null;
    const nextMentor = sourceMentor ?? currentTargetMentor;
    return {
        project: { id: project.id, name: project.name, owner: publicPerson(project.owner), program: project.program },
        target: { ...publicPerson(target), program: target.program },
        sourceMentor: sourceMentor ? publicPerson(sourceMentor) : null,
        currentTargetMentor: currentTargetMentor ? publicPerson(currentTargetMentor) : null,
        nextMentor: nextMentor ? publicPerson(nextMentor) : null,
        targetProjectCount: targetProjects.length,
        programChanged: project.programId !== target.program.id,
        mentorChanged: nextMentor?.id !== currentTargetMentor?.id,
        previewToken: transferSnapshotToken(state),
    };
}

export async function getProjectTransferPreview(tx: Prisma.TransactionClient, projectId: string, targetMenteeId: string) {
    return buildPreview(await readTransferState(tx, projectId, targetMenteeId));
}

export async function executeProjectTransfer(tx: Prisma.TransactionClient, projectId: string, targetMenteeId: string, previewToken: string) {
    const initial = await readTransferState(tx, projectId, targetMenteeId);
    if (!initial.project || !initial.target) throw new ProjectTransferError(TRANSFER_CONFLICT, 409);
    const userIds = [initial.project.ownerId, targetMenteeId, initial.project.owner.mentorAssignment?.mentorId, initial.target.mentorAssignment?.mentorId].filter((id): id is string => !!id);
    await lockTransferUsers(tx, userIds);
    const programIds = [...new Set([initial.project.programId, initial.target.program?.id].filter((id): id is string => !!id))].sort();
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "programs" WHERE "id" IN (${Prisma.join(programIds)}) ORDER BY "id" FOR SHARE`);
    await tx.$queryRaw`SELECT "id" FROM "projects" WHERE "id" = ${projectId} OR "ownerId" = ${targetMenteeId} ORDER BY "id" FOR UPDATE`;
    const menteeIds = [initial.project.ownerId, targetMenteeId].sort();
    await tx.$queryRaw(Prisma.sql`SELECT "menteeId" FROM "mentor_assignments" WHERE "menteeId" IN (${Prisma.join(menteeIds)}) ORDER BY "menteeId" FOR UPDATE`);
    const current = await readTransferState(tx, projectId, targetMenteeId);
    // 상태가 달라졌다면 새로 발견한 사용자를 뒤늦게 잠그지 않고 확인부터 다시 받는다.
    if (transferSnapshotToken(initial) !== transferSnapshotToken(current) || transferSnapshotToken(current) !== previewToken) {
        throw new ProjectTransferError(TRANSFER_CONFLICT, 409);
    }
    let preview: ProjectTransferPreview;
    try {
        preview = buildPreview(current);
    } catch (error) {
        // 미리보기와 값이 같아도 대기하는 동안 이용 기간이 만료될 수 있다.
        if (error instanceof ProjectTransferError) throw new ProjectTransferError(TRANSFER_CONFLICT, 409);
        throw error;
    }
    const project = current.project!;
    const updated = await tx.project.updateMany({
        where: { id: projectId, ownerId: project.ownerId, programId: project.programId, updatedAt: project.updatedAt },
        data: { ownerId: targetMenteeId, programId: preview.target.program.id },
    });
    if (updated.count !== 1) throw new ProjectTransferError(TRANSFER_CONFLICT, 409);
    if (preview.mentorChanged && preview.sourceMentor) {
        await tx.mentorAssignment.upsert({
            where: { menteeId: targetMenteeId },
            create: { menteeId: targetMenteeId, mentorId: preview.sourceMentor.id },
            update: { mentorId: preview.sourceMentor.id, assignedAt: new Date() },
        });
    }
    await tx.projectMember.deleteMany({ where: { projectId, userId: { in: [project.ownerId, targetMenteeId] } } });
}
