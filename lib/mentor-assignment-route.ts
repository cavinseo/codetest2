// 멘티 기준 배정을 기존 프로젝트 진입점과 공유해 단일 멘토 제한을 적용한다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from './prisma';
import { requireAuth } from './auth';
import { canAssignMentor, isAccessExpired } from './member-roles';
import { canManageThisProgram } from './program';
import { createLogger } from './logger';
import { toErrorResponse } from './api-error';

const log = createLogger('mentor-assignment');
const bodySchema = z.object({ userId: z.string().min(1) });
export async function handleMentorAssignment(request: NextRequest, id: string, byProject = false) {
    const actor = await requireAuth(request);
    if (actor instanceof NextResponse) return actor;
    if (!canAssignMentor(actor.role)) return NextResponse.json({ error: '멘토 배정 권한이 없습니다.' }, { status: 403 });
    try {
        const ownerId = byProject ? (await prisma.project.findUnique({ where: { id }, select: { ownerId: true } }))?.ownerId : id;
        if (!ownerId) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        const mentee = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, role: true, program: { select: { managerId: true } } } });
        if (!mentee || mentee.role !== 'MENTEE') return NextResponse.json({ error: '멘티를 찾을 수 없습니다.' }, { status: 404 });
        if (actor.role !== 'ADMIN' && (!mentee.program || !canManageThisProgram(actor, mentee.program))) {
            return NextResponse.json({ error: '담당 프로그램의 멘티만 배정할 수 있습니다.' }, { status: 403 });
        }
        if (request.method === 'GET') {
            if (request.nextUrl.searchParams.get('candidates') === '1') {
                const users = await prisma.user.findMany({ where: { role: { in: ['MENTOR', 'PROGRAM_MANAGER'] }, status: 'APPROVED' }, select: { id: true, name: true, email: true, role: true, accessExpiresAt: true }, orderBy: { name: 'asc' } });
                return NextResponse.json({ candidates: users.filter(user => !isAccessExpired(user.accessExpiresAt)).map(({ accessExpiresAt: _expiry, ...user }) => user) });
            }
            const assignment = await prisma.mentorAssignment.findUnique({ where: { menteeId: mentee.id }, include: { mentor: { select: { name: true, email: true, role: true } } } });
            return NextResponse.json({ menteeId: mentee.id, mentors: assignment ? [{ id: mentee.id, userId: assignment.mentorId, user: assignment.mentor }] : [] });
        }
        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) return NextResponse.json({ error: '멘토를 선택하세요.' }, { status: 400 });
        if (request.method === 'DELETE') {
            await prisma.mentorAssignment.deleteMany({ where: { menteeId: mentee.id, mentorId: parsed.data.userId } });
            return NextResponse.json({ success: true });
        }
        const target = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, role: true, status: true, accessExpiresAt: true } });
        if (!target || !['MENTOR', 'PROGRAM_MANAGER'].includes(target.role) || target.status !== 'APPROVED' || isAccessExpired(target.accessExpiresAt)) {
            return NextResponse.json({ error: '이용 가능한 멘토 또는 프로그램 매니저만 배정할 수 있습니다.' }, { status: 400 });
        }
        await prisma.mentorAssignment.upsert({ where: { menteeId: mentee.id }, create: { menteeId: mentee.id, mentorId: target.id }, update: { mentorId: target.id, assignedAt: new Date() } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return toErrorResponse(error, { log, message: '멘토 배정 처리에 실패했습니다.' });
    }
}
