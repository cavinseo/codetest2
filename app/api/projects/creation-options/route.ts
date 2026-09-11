// 활성화된 멘토에게 대리 개설 가능한 배정 멘티와 미사용 승인만 제공한다.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';

const log = createLogger('api/projects/creation-options');
export async function GET(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    if (auth.role !== 'MENTOR') return NextResponse.json({ error: '멘토 전용 기능입니다.' }, { status: 403 });
    try {
        const mentor = await prisma.user.findUnique({ where: { id: auth.userId }, select: { role: true, mentorProjectCreationEnabled: true } });
        if (mentor?.role !== 'MENTOR' || !mentor.mentorProjectCreationEnabled) {
            return NextResponse.json({ error: '멘토의 프로젝트 생성 기능이 사용중지 상태입니다.' }, { status: 403 });
        }
        const mentees = await prisma.user.findMany({
            where: { role: 'MENTEE', status: 'APPROVED', programId: { not: null }, mentorAssignment: { is: { mentorId: auth.userId } } },
            select: {
                id: true, name: true, email: true, programId: true,
                program: { select: { id: true, name: true } },
                _count: { select: { ownedProjects: true } },
                projectRequests: { where: { status: 'APPROVED', usedAt: null }, select: { id: true, reason: true, programId: true }, orderBy: { createdAt: 'asc' } },
            },
            orderBy: { name: 'asc' },
        });
        return NextResponse.json({ mentees: mentees.map(({ _count, projectRequests, ...mentee }) => ({
            ...mentee,
            ownedProjectCount: _count.ownedProjects,
            approvals: projectRequests.filter(approval => approval.programId === mentee.programId).map(({ id, reason }) => ({ id, reason })),
        })) });
    } catch (error) {
        return toErrorResponse(error, { log, message: '대리 개설 가능한 멘티를 불러오지 못했습니다.' });
    }
}
