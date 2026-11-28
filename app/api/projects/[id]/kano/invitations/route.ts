import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isProjectWriteRole, requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { z } from 'zod';

const log = createLogger('api/kano/invitations');
const invitationDeleteSchema = z.object({ invitationId: z.string().trim().min(1) }).strict();
const responseProtectedMessage = '접수된 응답이 있거나 초대 상태가 변경되어 삭제할 수 없습니다. 새로고침 후 확인해 주세요.';

// GET: 초대 내역 조회
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: false });
        if (accessResult instanceof NextResponse) return accessResult;
        const projectInvitations = await prisma.kanoSurveyInvitation.findMany({
            where: { projectId },
            orderBy: { expiresAt: 'desc' },
            include: { _count: { select: { responses: true } } },
        });

        // 토큰은 /survey/[token] 제출의 유일한 자격증명이다. 읽기 전용 역할이
        // 목록만 열어도 토큰을 모아 응답을 위조할 수 있고, 위조가 들어가면
        // respondedAt 이 찍혀 진짜 응답자가 영구히 막힌다. 그래서 "링크 복사"가
        // 필요한 쓰기 역할에게만 내려준다.
        const canSeeToken = isProjectWriteRole(accessResult.role);

        return NextResponse.json({
            invitations: projectInvitations.map((inv: any) => ({
                id: inv.id,
                email: inv.email,
                ...(canSeeToken ? { token: inv.token } : {}),
                expiresAt: inv.expiresAt,
                respondedAt: inv.respondedAt,
                canDelete: canSeeToken && !inv.respondedAt && inv._count.responses === 0,
            })),
        });
    } catch (error: unknown) {
        log.error('초대 내역 조회 실패', error);
        return NextResponse.json(
            { error: '초대 내역 조회 실패' },
            { status: 500 }
        );
    }
}

// 삭제 시점의 상태와 연결 응답을 함께 검사해 설문 제출과 경합해도 접수 응답을 보호한다.
export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: '삭제할 초대 ID를 올바른 JSON으로 보내 주세요.' }, { status: 400 });
        }
        const parsed = invitationDeleteSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: '삭제할 초대 ID 한 개만 보내 주세요.' }, { status: 400 });
        }
        const invitation = await prisma.kanoSurveyInvitation.findFirst({
            where: { id: parsed.data.invitationId, projectId },
            select: { id: true, respondedAt: true, _count: { select: { responses: true } } },
        });
        if (!invitation) return NextResponse.json({ error: '초대 기록을 찾을 수 없습니다.' }, { status: 404 });
        if (invitation.respondedAt || invitation._count.responses > 0) {
            return NextResponse.json({ error: responseProtectedMessage }, { status: 409 });
        }
        const deleted = await prisma.kanoSurveyInvitation.deleteMany({
            where: { id: invitation.id, projectId, respondedAt: null, responses: { none: {} } },
        });
        if (deleted.count === 0) return NextResponse.json({ error: responseProtectedMessage }, { status: 409 });
        return NextResponse.json({ success: true, message: '초대 기록을 삭제했습니다. 해당 설문 링크는 더 이상 사용할 수 없습니다.' });
    } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003') {
            return NextResponse.json({ error: responseProtectedMessage }, { status: 409 });
        }
        log.error('초대 기록 삭제 실패', error);
        return NextResponse.json({ error: '초대 기록 삭제 실패' }, { status: 500 });
    }
}
