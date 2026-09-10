// 관리자 프로그램 삭제 전에 연결 자료와 회원의 초대 로그인 수단을 보호한다.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { errorCodeOf, toErrorResponse } from '@/lib/api-error';

const log = createLogger('api/programs/delete');
const deletionSelect = {
    id: true, name: true,
    _count: { select: { projects: true, mentees: true, inviteCodes: true, projectRequests: true } },
    // 다른 프로그램으로 이동한 멘티도 원래 초대코드를 로그인에 사용한다.
    inviteCodes: { where: { OR: [{ usedAt: { not: null } }, { usedById: { not: null } }] }, select: { id: true } },
} satisfies Prisma.ProgramSelect;

function deletionPreview(program: Prisma.ProgramGetPayload<{ select: typeof deletionSelect }>) {
    const projectCount = program._count.projects;
    const menteeCount = program._count.mentees;
    const usedInviteCount = program.inviteCodes.length;
    const reasons: string[] = [];
    if (projectCount || menteeCount) {
        reasons.push(`프로젝트 ${projectCount}개와 멘티 ${menteeCount}명을 다른 프로그램으로 먼저 옮겨 주세요.`);
    }
    if (usedInviteCount) {
        reasons.push(`사용된 초대코드 ${usedInviteCount}개가 연결되어 있습니다. 멘티의 로그인과 이용 기한을 보존하기 위해 삭제할 수 없습니다.`);
    }
    return {
        id: program.id, name: program.name, projectCount, menteeCount,
        inviteCount: program._count.inviteCodes, requestCount: program._count.projectRequests,
        usedInviteCount, canDelete: reasons.length === 0, blockReason: reasons.join(' '),
    };
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const { id } = await props.params;
    try {
        const program = await prisma.program.findUnique({ where: { id }, select: deletionSelect });
        if (!program) return NextResponse.json({ error: '프로그램을 찾을 수 없습니다.' }, { status: 404 });
        return NextResponse.json({ program: deletionPreview(program) });
    } catch (error) {
        return toErrorResponse(error, { log, message: '삭제할 프로그램 정보를 불러오지 못했습니다.', context: { programId: id } });
    }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const { id } = await props.params;
    const body = await request.json().catch(() => null);
    if (body?.confirm !== true) {
        return NextResponse.json({ error: '프로그램 삭제 확인이 필요합니다.' }, { status: 400 });
    }
    if (!Number.isInteger(body.inviteCount) || body.inviteCount < 0 || !Number.isInteger(body.requestCount) || body.requestCount < 0) {
        return NextResponse.json({ error: '삭제할 초대코드와 신청 이력 건수를 확인해 주세요.' }, { status: 400 });
    }
    try {
        const result = await prisma.$transaction(async (tx) => {
            // 새 프로젝트·회원의 FK 연결이 확인과 삭제 사이에 끼어들지 못하게 한다.
            await tx.$queryRaw`SELECT id FROM programs WHERE id = ${id} FOR UPDATE`;
            const program = await tx.program.findUnique({ where: { id }, select: deletionSelect });
            if (!program) return { status: 404, body: { error: '프로그램을 찾을 수 없습니다.' } };
            const preview = deletionPreview(program);
            if (!preview.canDelete) return { status: 409, body: { error: preview.blockReason, program: preview } };
            if (preview.inviteCount !== body.inviteCount || preview.requestCount !== body.requestCount) {
                return { status: 409, body: { error: '삭제할 초대코드 또는 신청 이력이 변경되었습니다. 변경된 건수를 확인한 뒤 다시 삭제해 주세요.', program: preview } };
            }
            await tx.program.delete({ where: { id } });
            return { status: 200, body: { success: true, deletedProgram: program.name } };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 });
        if (result.status === 200) log.info('프로그램 삭제', { programId: id, actorId: auth.userId });
        return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
        const code = errorCodeOf(error);
        if (code === 'P2025') return NextResponse.json({ error: '프로그램을 찾을 수 없습니다.' }, { status: 404 });
        if (code === 'P2003' || code === 'P2034') {
            return NextResponse.json({ error: '프로그램 연결 정보가 변경되었습니다. 목록을 새로고침한 뒤 다시 확인해 주세요.' }, { status: 409 });
        }
        return toErrorResponse(error, { log, message: '프로그램 삭제에 실패했습니다.', context: { programId: id } });
    }
}
