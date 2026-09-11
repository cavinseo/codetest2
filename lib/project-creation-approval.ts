// 동시 생성 요청이 프로젝트 수 제한과 승인 소비를 우회하지 못하게 한다.
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
export class ProjectApprovalError extends Error {}
export class MentorProjectCreationError extends Error {}
export async function createProjectWithApproval(data: Prisma.ProjectUncheckedCreateInput, requiresApproval: boolean, approvalRequestId?: string, mentorId?: string) {
    return prisma.$transaction(async tx => {
        if (mentorId) {
            const mentors = await tx.$queryRaw<{ role: string; status: string; mentorProjectCreationEnabled: boolean }[]>`
                SELECT "role", "status", "mentorProjectCreationEnabled" FROM "users" WHERE "id" = ${mentorId} FOR UPDATE`;
            const mentor = mentors[0];
            if (!mentor || mentor.role !== 'MENTOR' || mentor.status !== 'APPROVED' || !mentor.mentorProjectCreationEnabled) {
                throw new MentorProjectCreationError('멘토의 프로젝트 생성 기능이 사용중지 상태입니다. 관리자에게 문의하세요.');
            }
        }
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${data.ownerId} FOR UPDATE`;
        if (mentorId) {
            // 배정 변경·해제와 소속 프로그램 변경이 생성 중간에 끼어들지 못하게 한다.
            const assignments = await tx.$queryRaw<{ mentorId: string }[]>`
                SELECT "mentorId" FROM "mentor_assignments" WHERE "menteeId" = ${data.ownerId} FOR UPDATE`;
            const owner = await tx.user.findUnique({ where: { id: data.ownerId }, select: { role: true, programId: true, status: true } });
            if (assignments[0]?.mentorId !== mentorId || owner?.role !== 'MENTEE' || owner.status !== 'APPROVED' || owner.programId !== data.programId) {
                throw new MentorProjectCreationError('현재 배정된 멘티의 소속 프로그램에만 프로젝트를 만들 수 있습니다.');
            }
        }
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
