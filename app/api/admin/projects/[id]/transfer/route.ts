// 관리자만 프로젝트 강제 이관의 후보·미리보기·최종 실행에 접근하게 한다.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { executeProjectTransfer, getProjectTransferPreview, isTransferConflictError, ProjectTransferError, TRANSFER_CONFLICT } from '@/lib/project-transfer';

const log = createLogger('api/admin/project-transfer');
type Context = { params: Promise<{ id: string }> };
const transferBody = z.object({ targetMenteeId: z.string().trim().min(1), previewToken: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict();

function errorResponse(error: unknown) {
    if (error instanceof ProjectTransferError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: '올바른 요청 내용을 보내세요.' }, { status: 400 });
    if (isTransferConflictError(error)) {
        return NextResponse.json({ error: TRANSFER_CONFLICT }, { status: 409 });
    }
    return toErrorResponse(error, { log, message: '프로젝트 이관 처리에 실패했습니다.' });
}

export async function GET(request: NextRequest, context: Context) {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;
    try {
        const { id } = await context.params;
        const targetMenteeId = request.nextUrl.searchParams.get('targetMenteeId');
        if (targetMenteeId !== null) {
            if (!targetMenteeId.trim()) return NextResponse.json({ error: '대상 멘티를 선택하세요.' }, { status: 400 });
            const preview = await prisma.$transaction(tx => getProjectTransferPreview(tx, id, targetMenteeId), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
            return NextResponse.json({ preview });
        }
        const project = await prisma.project.findUnique({ where: { id }, select: { ownerId: true } });
        if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        const candidates = await prisma.user.findMany({
            where: { id: { not: project.ownerId }, role: 'MENTEE', status: 'APPROVED', programId: { not: null }, OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: new Date() } }] },
            select: { id: true, name: true, email: true, program: { select: { id: true, name: true } } },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
        });
        return NextResponse.json({ candidates });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(request: NextRequest, context: Context) {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;
    try {
        const parsed = transferBody.safeParse(await request.json());
        if (!parsed.success) return NextResponse.json({ error: '대상 멘티와 미리보기를 선택하고 최종 확인하세요.' }, { status: 400 });
        const { id } = await context.params;
        const { targetMenteeId, previewToken } = parsed.data;
        await prisma.$transaction(tx => executeProjectTransfer(tx, id, targetMenteeId, previewToken), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
        log.info('프로젝트 강제 이관 완료', { projectId: id, targetMenteeId, actorId: admin.userId });
        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}
