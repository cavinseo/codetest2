import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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
        const projectInvitations = await prisma.kanoSurveyInvitation.findMany({
            where: { projectId },
            orderBy: { expiresAt: 'desc' },
        });

        return NextResponse.json({
            invitations: projectInvitations.map((inv: any) => ({
                id: inv.id,
                email: inv.email,
                token: inv.token,
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
