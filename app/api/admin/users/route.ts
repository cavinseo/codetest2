import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { requireAdmin } from '@/lib/authorization';

const log = createLogger('api/admin/users');

// ─── GET: 모든 사용자 목록 (passwordHash 제외) ─────────────────────────

export async function GET(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                status: true,
                isAdmin: true,
                createdAt: true,
                updatedAt: true,
            },
            // 승인 대기가 먼저 보이도록 정렬한다.
            orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
        });

        return NextResponse.json({ users });
    } catch (error: unknown) {
        log.error('사용자 목록 조회 실패', error);
        return NextResponse.json({ error: '사용자 목록 조회 실패' }, { status: 500 });
    }
}

// ─── PATCH: 가입 승인/승인 취소 ────────────────────────────────────────

export async function PATCH(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const body = await request.json();
        const userId: string | undefined = body?.userId;
        const action: string | undefined = body?.action;

        if (!userId || (action !== 'approve' && action !== 'revoke')) {
            return NextResponse.json(
                { error: 'userId 와 action(approve|revoke)이 필요합니다.' },
                { status: 400 }
            );
        }

        const target = await prisma.user.findUnique({ where: { id: userId } });
        if (!target) {
            return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
        }
        // 관리자 계정을 승인 취소로 잠그는 실수를 막는다.
        if (action === 'revoke' && target.isAdmin) {
            return NextResponse.json({ error: '관리자 계정은 승인을 취소할 수 없습니다.' }, { status: 400 });
        }

        const updated = await prisma.user.update({
            where: { id: userId },
            data: { status: action === 'approve' ? 'APPROVED' : 'PENDING' },
            select: { id: true, email: true, status: true },
        });

        log.info('사용자 승인 상태 변경', { userId, status: updated.status });
        return NextResponse.json({ success: true, user: updated });
    } catch (error: unknown) {
        log.error('사용자 승인 상태 변경 실패', error);
        return NextResponse.json({ error: '승인 상태 변경에 실패했습니다.' }, { status: 500 });
    }
}

// ─── DELETE: 사용자 삭제 ──────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const body = await request.json();
        const userId: string | undefined = body?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'userId가 필요합니다.' }, { status: 400 });
        }

        const target = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!target) {
            return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
        }

        await prisma.user.delete({
            where: { id: userId },
        });

        log.info('사용자 삭제', { userId });
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        log.error('사용자 삭제 실패', error);
        return NextResponse.json({ error: '사용자 삭제 실패' }, { status: 500 });
    }
}
