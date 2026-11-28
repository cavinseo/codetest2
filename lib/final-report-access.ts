// 결과보고서의 초안 편집·열람 권한과 표지 메타데이터를 두 다운로드 경로에 제공한다.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess, type ProjectAccess } from '@/lib/authorization';

const privateHeaders = { 'Cache-Control': 'private, no-store' };

function canBeAssignedMentor(access: ProjectAccess) {
    return access.user.role === 'MENTOR' || access.user.role === 'PROGRAM_MANAGER';
}

export async function getFinalReportAccess(request: NextRequest, id: string) {
    const access = await requireProjectAccess(request, id);
    if (access instanceof NextResponse) return access;
    const project = await prisma.project.findUnique({ where: { id }, select: {
        companyName: true,
        owner: { select: { profile: { select: { companyName: true } }, mentorAssignment: { select: { mentorId: true, mentor: { select: { name: true } } } } } },
    } });
    if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404, headers: privateHeaders });
    const assignment = project.owner.mentorAssignment;
    const canEdit = canBeAssignedMentor(access) && assignment?.mentorId === access.user.userId;
    return { access, canEdit, canReadDraft: canEdit || access.user.role === 'ADMIN', mentorName: assignment?.mentor.name ?? null,
        companyName: project.companyName ?? project.owner.profile?.companyName ?? null };
}
