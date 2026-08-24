// 한 프로그램에 속한 멘티 목록(GET)과 멘티 배정(POST).
//
// GET 은 새 프로젝트를 개설할 때 소유자 후보로 쓴다.
// POST 는 기존 멘티를 이 프로그램으로 불러온다 — 초대 코드는 새로 가입하는
// 멘티만 프로그램에 묶어 주므로, 그 전에 가입했거나 관리자가 프로그램 없이
// 만든 멘티는 이 경로가 없으면 영영 어느 프로그램에도 들어가지 못하고
// 프로젝트 소유자로 지정될 수도 없다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { canManagePrograms, parseMemberRole } from '@/lib/member-roles';
import { canManageThisProgram, programMoveOutcome } from '@/lib/program';

const log = createLogger('api/programs/mentees');

const assignSchema = z.object({
    userId: z.string().min(1),
    confirmReassign: z.boolean().optional(),
});

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: programId } = await props.params;
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canManagePrograms(authResult.role)) {
        return NextResponse.json({ error: '멘티 목록을 볼 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const program = await prisma.program.findUnique({
            where: { id: programId },
            select: { managerId: true },
        });
        if (!program) {
            return NextResponse.json({ error: '프로그램을 찾을 수 없습니다.' }, { status: 404 });
        }
        if (!canManageThisProgram({ role: authResult.role, userId: authResult.userId }, program)) {
            return NextResponse.json({ error: '이 프로그램의 멘티 목록을 볼 권한이 없습니다.' }, { status: 403 });
        }

        // ?candidates=1 은 "이 프로그램에 배정할 수 있는 멘티"를 준다. 아직 이
        // 프로그램에 없는 승인된 멘티 전부이며, 지금 어디 소속인지도 함께 준다
        // (다른 프로그램 소속이면 화면이 재확인을 받아야 하므로).
        if (new URL(request.url).searchParams.get('candidates') === '1') {
            const rows = await prisma.user.findMany({
                // NOT: { programId } 을 쓰면 안 된다. programId 는 nullable 이라
                // SQL 의 NOT (col = x) 이 NULL 행에서 NULL 로 평가돼 통째로 빠진다.
                // 정작 배정이 가장 필요한 "아직 어느 프로그램에도 없는 멘티"가
                // 전부 사라져 후보 목록이 비어 버린다. 실제 DB 로 확인한 동작이다.
                where: {
                    role: 'MENTEE', status: 'APPROVED',
                    OR: [{ programId: null }, { programId: { not: programId } }],
                },
                select: { id: true, name: true, email: true, programId: true, program: { select: { name: true } } },
                orderBy: { name: 'asc' },
            });

            return NextResponse.json({
                candidates: rows.map(({ program, ...rest }) => ({
                    ...rest,
                    programName: program?.name ?? null,
                })),
            });
        }

        const mentees = await prisma.user.findMany({
            where: { programId, role: 'MENTEE', status: 'APPROVED' },
            select: { id: true, name: true, email: true },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({ mentees });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '멘티 목록을 불러오지 못했습니다.', context: { programId } });
    }
}

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: programId } = await props.params;
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canManagePrograms(authResult.role)) {
        return NextResponse.json({ error: '멘티를 배정할 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const parsed = assignSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'userId가 필요합니다.' }, { status: 400 });
        }

        const program = await prisma.program.findUnique({
            where: { id: programId },
            select: { id: true, name: true, managerId: true },
        });
        if (!program) {
            return NextResponse.json({ error: '프로그램을 찾을 수 없습니다.' }, { status: 404 });
        }
        if (!canManageThisProgram({ role: authResult.role, userId: authResult.userId }, program)) {
            return NextResponse.json({ error: '이 프로그램에 멘티를 배정할 권한이 없습니다.' }, { status: 403 });
        }

        const target = await prisma.user.findUnique({
            where: { id: parsed.data.userId },
            select: { id: true, name: true, role: true, programId: true, program: { select: { name: true } } },
        });
        if (!target) {
            return NextResponse.json({ error: '회원을 찾을 수 없습니다.' }, { status: 404 });
        }
        // 프로그램에 속하는 것은 멘티뿐이다. 멘토는 여러 프로그램의 프로젝트에
        // 배정될 수 있어 한 프로그램에 묶지 않는다(User.programId 주석 참고).
        if (parseMemberRole(target.role) !== 'MENTEE') {
            return NextResponse.json({ error: '멘티만 프로그램에 배정할 수 있습니다.' }, { status: 400 });
        }

        const outcome = programMoveOutcome(target.programId, programId, parsed.data.confirmReassign === true);

        if (outcome === 'already-here') {
            return NextResponse.json({ error: '이미 이 프로그램에 속한 멘티입니다.' }, { status: 400 });
        }

        if (outcome === 'needs-confirm') {
            return NextResponse.json(
                {
                    error: `${target.name} 님은 이미 "${target.program?.name}" 프로그램에 속해 있습니다.`
                        + ' 그래도 이 프로그램으로 옮기시겠습니까?',
                    needsReassignConfirm: true,
                    currentProgramName: target.program?.name ?? null,
                },
                { status: 409 }
            );
        }

        await prisma.user.update({
            where: { id: target.id },
            data: { programId },
        });

        log.info('멘티를 프로그램에 배정', {
            menteeId: target.id, fromProgramId: target.programId ?? undefined, toProgramId: programId,
        });

        return NextResponse.json({
            success: true,
            mentee: { id: target.id, name: target.name, programName: program.name },
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '멘티를 배정하지 못했습니다.', context: { programId } });
    }
}
