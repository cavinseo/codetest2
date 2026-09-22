// 미사용이며 회원이 연결되지 않은 초대 코드만 실제로 삭제한다.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { canIssueInviteCode } from '@/lib/member-roles';
import { canManageThisProgram } from '@/lib/program';
import { createLogger } from '@/lib/logger';
import { errorCodeOf } from '@/lib/api-error';

const log = createLogger('api/invites/delete');

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    if (!canIssueInviteCode(auth.role)) {
        return NextResponse.json({ error: '초대 코드를 삭제할 권한이 없습니다.' }, { status: 403 });
    }

    const { id } = await props.params;
    try {
        const invite = await prisma.inviteCode.findUnique({
            where: { id }, select: { id: true, usedAt: true, usedById: true, program: { select: { managerId: true } } },
        });
        if (!invite) return NextResponse.json({ error: '초대 코드를 찾을 수 없습니다.' }, { status: 404 });
        if (!canManageThisProgram(auth, invite.program)) {
            return NextResponse.json({ error: '이 초대 코드를 삭제할 권한이 없습니다.' }, { status: 403 });
        }
        if (invite.usedAt || invite.usedById) {
            return NextResponse.json({ error: '사용했거나 회원이 연결된 초대 코드는 삭제할 수 없습니다.' }, { status: 409 });
        }

        // 조회 후 첫 로그인·회원 연결이 일어나도 삭제 조건을 다시 검사해 연결을 보존한다.
        const deleted = await prisma.inviteCode.deleteMany({ where: {
            id: invite.id, usedAt: null, usedById: null,
            ...(auth.role === 'PROGRAM_MANAGER' ? { program: { managerId: auth.userId } } : {}),
        } });
        if (deleted.count !== 1) {
            return NextResponse.json({ error: '초대 정보가 변경되어 삭제하지 못했습니다. 목록을 새로고침하세요.' }, { status: 409 });
        }
        log.info('초대 코드 삭제', { inviteId: invite.id });
        return NextResponse.json({ success: true, id: invite.id });
    } catch (error) {
        log.error('초대 코드 삭제 실패', undefined, { code: errorCodeOf(error) ?? undefined });
        return NextResponse.json({ error: '초대 코드 삭제에 실패했습니다.' }, { status: 500 });
    }
}
