// 프로젝트에 멘토를 배정하고 해제하는 API.
//
// 배정은 ProjectMember.role = 'COACH' 로 기록한다. COACH 는 WRITE_ROLES 밖이라
// 읽기 전용이 보장되므로 새 프로젝트 역할을 만들지 않는다.
//
// 매니저도 배정하므로 requireAdmin 이 아니라 시스템 역할 게이트를 쓴다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { canAssignMentor, parseMemberRole } from '@/lib/member-roles';

const log = createLogger('api/mentors');

const bodySchema = z.object({ userId: z.string().min(1) });

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canAssignMentor(authResult.role)) {
        return NextResponse.json({ error: '멘토 배정을 볼 권한이 없습니다.' }, { status: 403 });
    }

    // 매니저는 /api/admin/users(requireAdmin)를 못 본다. 배정 후보 목록은 이
    // 엔드포인트에서 함께 내려, 매니저도 배정 대상을 고를 수 있게 한다.
    const wantsCandidates = new URL(request.url).searchParams.get('candidates') === '1';
    if (wantsCandidates) {
        try {
            const candidates = await prisma.user.findMany({
                where: { role: { in: ['MENTOR', 'PROGRAM_MANAGER'] } },
                select: { id: true, name: true, email: true, role: true },
                orderBy: { name: 'asc' },
            });

            return NextResponse.json({ candidates });
        } catch (error: unknown) {
            return toErrorResponse(error, { log, message: '배정 후보 목록을 불러오지 못했습니다.', context: { projectId } });
        }
    }

    try {
        const members = await prisma.projectMember.findMany({
            where: { projectId, role: 'COACH' },
            select: {
                id: true, userId: true, joinedAt: true,
                user: { select: { name: true, email: true, role: true } },
            },
        });

        return NextResponse.json({ mentors: members });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '멘토 목록을 불러오지 못했습니다.', context: { projectId } });
    }
}

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canAssignMentor(authResult.role)) {
        return NextResponse.json({ error: '멘토를 배정할 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'userId 가 필요합니다.' }, { status: 400 });
        }

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true },
        });
        if (!project) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        const target = await prisma.user.findUnique({
            where: { id: parsed.data.userId },
            select: { id: true, name: true, email: true, role: true },
        });
        if (!target) {
            return NextResponse.json({ error: '대상 회원을 찾을 수 없습니다.' }, { status: 404 });
        }

        // 매니저는 멘토에서 승격되므로 겸직 대상이다. 멘티·관리자는 배정하지 않는다.
        const targetRole = parseMemberRole(target.role);
        if (targetRole !== 'MENTOR' && targetRole !== 'PROGRAM_MANAGER') {
            return NextResponse.json(
                { error: '멘토 또는 프로그램 매니저만 배정할 수 있습니다.' },
                { status: 400 }
            );
        }

        const existing = await prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId, userId: target.id } },
            select: { id: true, role: true },
        });
        if (existing) {
            return NextResponse.json({ error: '이미 이 프로젝트에 참여 중입니다.' }, { status: 409 });
        }

        await prisma.projectMember.create({
            data: {
                id: generateId('member'),
                projectId,
                userId: target.id,
                role: 'COACH',
                invitedBy: authResult.userId,
                joinedAt: new Date(),
            },
        });

        log.info('멘토 배정', { projectId, mentorUserId: target.id });
        return NextResponse.json({
            success: true,
            mentor: { userId: target.id, name: target.name, role: 'COACH' },
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '멘토 배정에 실패했습니다.', context: { projectId } });
    }
}

export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canAssignMentor(authResult.role)) {
        return NextResponse.json({ error: '멘토 배정을 해제할 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'userId 가 필요합니다.' }, { status: 400 });
        }

        const member = await prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId, userId: parsed.data.userId } },
            select: { id: true, role: true },
        });
        if (!member) {
            return NextResponse.json({ error: '배정 기록을 찾을 수 없습니다.' }, { status: 404 });
        }
        // 해제는 배정된 멘토만 대상으로 한다. 편집자·소유자를 여기서 떼지 않는다.
        if (member.role !== 'COACH') {
            return NextResponse.json({ error: '멘토로 배정된 회원이 아닙니다.' }, { status: 400 });
        }

        await prisma.projectMember.delete({ where: { id: member.id } });

        log.info('멘토 배정 해제', { projectId, mentorUserId: parsed.data.userId });
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '멘토 배정 해제에 실패했습니다.', context: { projectId } });
    }
}
