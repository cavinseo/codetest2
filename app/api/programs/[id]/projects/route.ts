// 기존 프로젝트를 이 프로그램으로 불러온다(재배정).
//
// Project.programId 는 필수 컬럼이라 모든 프로젝트가 이미 어딘가에 속해
// 있다 — 그래서 이 동작은 사실상 "다른 프로그램에서 이관"이다. 다른
// 프로그램 소속을 조용히 가로채지 않도록, 이미 다른 곳에 속해 있으면
// confirmReassign 없이는 409 로 한 번 멈춘다(lib/program.ts projectImportOutcome).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { canManagePrograms } from '@/lib/member-roles';
import { canManageThisProgram, programMoveOutcome } from '@/lib/program';

const log = createLogger('api/programs/projects');

const importSchema = z.object({
    projectId: z.string().min(1),
    confirmReassign: z.boolean().optional(),
});

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: programId } = await props.params;
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canManagePrograms(authResult.role)) {
        return NextResponse.json({ error: '프로젝트를 불러올 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const parsed = importSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'projectId가 필요합니다.' }, { status: 400 });
        }

        const program = await prisma.program.findUnique({
            where: { id: programId },
            select: { id: true, name: true, managerId: true },
        });
        if (!program) {
            return NextResponse.json({ error: '프로그램을 찾을 수 없습니다.' }, { status: 404 });
        }
        // 옮겨 넣을 프로그램만 관리 권한을 본다. 원래 프로그램 쪽 권한은 보지
        // 않는다 — 매니저는 이미 전체 프로젝트 목록을 볼 수 있고(canListAllProjects),
        // 사용자가 요청한 안전장치는 "다시 한번 확인"이지 다른 매니저의 승인이 아니다.
        if (!canManageThisProgram({ role: authResult.role, userId: authResult.userId }, program)) {
            return NextResponse.json({ error: '이 프로그램에 프로젝트를 불러올 권한이 없습니다.' }, { status: 403 });
        }

        const project = await prisma.project.findUnique({
            where: { id: parsed.data.projectId },
            select: { id: true, name: true, programId: true, program: { select: { name: true } } },
        });
        if (!project) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        const outcome = programMoveOutcome(project.programId, programId, parsed.data.confirmReassign === true);

        if (outcome === 'already-here') {
            return NextResponse.json({ error: '이미 이 프로그램에 속한 프로젝트입니다.' }, { status: 400 });
        }

        if (outcome === 'needs-confirm') {
            return NextResponse.json(
                {
                    error: `이 프로젝트는 이미 "${project.program.name}" 프로그램에 속해 있습니다.`
                        + ' 그래도 이 프로그램으로 옮기시겠습니까?',
                    needsReassignConfirm: true,
                    currentProgramName: project.program.name,
                },
                { status: 409 }
            );
        }

        await prisma.project.update({
            where: { id: project.id },
            data: { programId },
        });

        log.info('프로젝트를 프로그램으로 불러옴', {
            projectId: project.id, fromProgramId: project.programId, toProgramId: programId,
        });

        return NextResponse.json({
            success: true,
            project: { id: project.id, name: project.name, programName: program.name },
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '프로젝트를 불러오지 못했습니다.', context: { programId } });
    }
}
