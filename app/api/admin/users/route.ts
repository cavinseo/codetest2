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
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ users });
    } catch (error: unknown) {
        log.error('사용자 목록 조회 실패', error);
        return NextResponse.json({ error: '사용자 목록 조회 실패' }, { status: 500 });
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
