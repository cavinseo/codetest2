import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/kano/invitations');

// GET: 珥덈? ?댁뿭 議고쉶
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
        log.error('珥덈? ?댁뿭 議고쉶 ?ㅽ뙣', error);
        return NextResponse.json(
            { error: '珥덈? ?댁뿭 議고쉶 ?ㅽ뙣' },
            { status: 500 }
        );
    }
}
