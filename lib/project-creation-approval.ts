// 동시 생성 요청이 프로젝트 수 제한과 승인 소비를 우회하지 못하게 한다.
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
export class ProjectApprovalError extends Error {}
export async function createProjectWithApproval(data: Prisma.ProjectUncheckedCreateInput, requiresApproval: boolean, approvalRequestId?: string) {
    return prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${data.ownerId} FOR UPDATE`;
        if (requiresApproval && await tx.project.count({ where: { ownerId: data.ownerId } }) >= 1) {
            if (!approvalRequestId) throw new ProjectApprovalError('추가 프로젝트는 프로그램 매니저의 승인이 필요합니다.');
            const consumed = await tx.projectCreationRequest.updateMany({
                where: { id: approvalRequestId, menteeId: data.ownerId, programId: data.programId, status: 'APPROVED', usedAt: null },
                data: { usedAt: new Date() },
            });
            if (consumed.count !== 1) throw new ProjectApprovalError('사용 가능한 개설 승인이 아닙니다.');
        }
        return tx.project.create({ data });
    });
}
