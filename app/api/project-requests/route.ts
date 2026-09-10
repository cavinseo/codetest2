// 멘티의 추가 개설 신청과 담당 매니저의 일회성 승인을 관리한다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { canManageThisProgram } from '@/lib/program';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
const log = createLogger('project-requests');

export async function GET(request: NextRequest) {
    const actor = await requireAuth(request);
    if (actor instanceof NextResponse) return actor;
    if (!['ADMIN', 'PROGRAM_MANAGER', 'MENTEE'].includes(actor.role)) return NextResponse.json({ error: '조회 권한이 없습니다.' }, { status: 403 });
    try {
        const where = actor.role === 'ADMIN' ? {} : actor.role === 'MENTEE' ? { menteeId: actor.userId } : { program: { managerId: actor.userId } };
        const requests = await prisma.projectCreationRequest.findMany({ where, include: { mentee: { select: { name: true } }, program: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
        const ownedProjectCount = actor.role === 'MENTEE' ? await prisma.project.count({ where: { ownerId: actor.userId } }) : null;
        return NextResponse.json({ requests, ownedProjectCount });
    } catch (error) { return toErrorResponse(error, { log, message: '개설 신청을 불러오지 못했습니다.' }); }
}
export async function POST(request: NextRequest) {
    const actor = await requireAuth(request);
    if (actor instanceof NextResponse) return actor;
    if (actor.role !== 'MENTEE') return NextResponse.json({ error: '멘티만 신청할 수 있습니다.' }, { status: 403 });
    try {
        const parsed = z.object({ reason: z.string().trim().min(1).max(2000) }).safeParse(await request.json());
        if (!parsed.success) return NextResponse.json({ error: '신청 사유를 1~2,000자로 입력하세요.' }, { status: 400 });
        const me = await prisma.user.findUnique({ where: { id: actor.userId }, select: { programId: true } });
        if (!me?.programId) return NextResponse.json({ error: '소속 프로그램이 없습니다.' }, { status: 400 });
        const application = await prisma.projectCreationRequest.create({ data: { menteeId: actor.userId, programId: me.programId, reason: parsed.data.reason } });
        return NextResponse.json({ request: application }, { status: 201 });
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return NextResponse.json({ error: '이미 승인 대기 중인 신청이 있습니다.' }, { status: 409 });
        return toErrorResponse(error, { log, message: '개설 신청에 실패했습니다.' });
    }
}
export async function PATCH(request: NextRequest) {
    const actor = await requireAuth(request);
    if (actor instanceof NextResponse) return actor;
    if (!['ADMIN', 'PROGRAM_MANAGER'].includes(actor.role)) return NextResponse.json({ error: '승인 권한이 없습니다.' }, { status: 403 });
    try {
        const parsed = z.object({ requestId: z.string().min(1), status: z.enum(['APPROVED', 'REJECTED']), reviewNote: z.string().trim().max(2000).optional() }).safeParse(await request.json());
        if (!parsed.success) return NextResponse.json({ error: '승인 또는 반려와 신청을 선택하세요.' }, { status: 400 });
        const application = await prisma.projectCreationRequest.findUnique({ where: { id: parsed.data.requestId }, include: { program: { select: { managerId: true } } } });
        if (!application) return NextResponse.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 });
        if (!canManageThisProgram(actor, application.program)) return NextResponse.json({ error: '담당 프로그램의 신청만 처리할 수 있습니다.' }, { status: 403 });
        const updated = await prisma.projectCreationRequest.updateMany({
            where: { id: application.id, status: 'PENDING', ...(actor.role === 'ADMIN' ? {} : { program: { managerId: actor.userId } }) },
            data: { status: parsed.data.status, reviewNote: parsed.data.reviewNote, reviewedById: actor.userId, reviewedAt: new Date() },
        });
        if (updated.count !== 1) return NextResponse.json({ error: '이미 처리된 신청입니다.' }, { status: 409 });
        return NextResponse.json({ success: true });
    } catch (error) { return toErrorResponse(error, { log, message: '승인 처리에 실패했습니다.' }); }
}
