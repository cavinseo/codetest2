import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/survey');

// GET: 설문 조회 (토큰으로)
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ token: string }> }
) {
    const params = await props.params;
    try {
        const token = params.token;

        const invitation = await prisma.kanoSurveyInvitation.findUnique({
            where: { token },
        });

        if (!invitation) {
            return NextResponse.json({ error: '유효하지 않은 설문 링크입니다.' }, { status: 404 });
        }

        if (invitation.expiresAt < new Date()) {
            return NextResponse.json({ error: '설문 링크가 만료되었습니다.' }, { status: 410 });
        }

        if (invitation.respondedAt) {
            return NextResponse.json(
                { error: '이미 응답을 완료하셨습니다.' },
                { status: 400 }
            );
        }

        const project = await prisma.project.findUnique({
            where: { id: invitation.projectId },
            select: { name: true },
        });
        const projectName = project?.name || '프로젝트';

        const requirements = await prisma.customerRequirement.findMany({
            where: { projectId: invitation.projectId },
            orderBy: { order: 'asc' },
        });

        if (requirements.length === 0) {
            return NextResponse.json(
                { error: '설문 데이터가 없습니다.' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            projectName,
            requirements: requirements.map((r: any) => ({
                id: r.id,
                category: r.category,
                subcategory: r.subcategory,
                requirement: r.requirement,
                kanoPositiveQ: r.kanoPositiveQ ?? null,
                kanoNegativeQ: r.kanoNegativeQ ?? null,
                order: r.order,
            })),
            respondentEmail: invitation.email,
        });
    } catch (error: unknown) {
        log.error('설문 조회 오류', error);
        return NextResponse.json({ error: '설문 조회 실패' }, { status: 500 });
    }
}
