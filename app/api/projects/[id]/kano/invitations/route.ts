import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isProjectWriteRole, requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/kano/invitations');

// GET: 초대 내역 조회
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const projectInvitations = await prisma.kanoSurveyInvitation.findMany({
            where: { projectId },
            orderBy: { expiresAt: 'desc' },
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
