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

        // 자기 자신을 지워 관리 화면에서 스스로 잠기는 사고를 막는다.
        if (userId === adminResult.userId) {
            return NextResponse.json({ error: '본인 계정은 삭제할 수 없습니다.' }, { status: 400 });
        }

        // 마지막 관리자를 지우면 승인·관리 기능이 영구히 잠긴다.
        if (target.isAdmin) {
            const adminCount = await prisma.user.count({ where: { isAdmin: true } });
            if (adminCount <= 1) {
                return NextResponse.json(
                    { error: '마지막 관리자 계정은 삭제할 수 없습니다.' },
                    { status: 400 }
                );
            }
        }

        // User 삭제는 Project.ownerId 의 onDelete: Cascade 를 타고 그 사람이 소유한
        // 프로젝트 전체와 하위 워크시트를 지운다. 그 프로젝트에 참여한 다른 사람의
        // 작업물까지 함께 사라지므로, 건수를 알려주고 확인을 받는다.
        const ownedProjects = await prisma.project.count({ where: { ownerId: userId } });
        if (ownedProjects > 0 && body?.confirmCascade !== true) {
            return NextResponse.json(
                {
                    error: `이 사용자가 소유한 프로젝트 ${ownedProjects}개와 그 안의 모든 워크시트가 함께 삭제됩니다.`
                        + ' 다른 참여자의 작업물도 사라집니다.',
                    needsCascadeConfirm: true,
                    ownedProjects,
                },
                { status: 409 }
            );
        }

        await prisma.user.delete({
            where: { id: userId },
        });

        log.info('사용자 삭제', { userId, ownedProjects });
        return NextResponse.json({ success: true, ownedProjects });
    } catch (error: unknown) {
        // 설문을 발송했거나 엑셀을 import 한 이력이 있으면 FK 제약(Restrict)에 걸린다.
        // 예전에는 이것도 뭉뚱그려 500 이라 원인을 알 수 없었다.
        if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2003') {
            return NextResponse.json(
                { error: '이 사용자는 설문 발송·가져오기 이력이 있어 삭제할 수 없습니다. 승인을 취소해 접근만 막아 주세요.' },
                { status: 409 }
            );
        }
        log.error('사용자 삭제 실패', error);
        return NextResponse.json({ error: '사용자 삭제 실패' }, { status: 500 });
    }
}
