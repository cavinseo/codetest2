// 오프라인에서 작성하고 다시 제출할 수 있는 자급자족 Kano HTML 설문지를 내려준다.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import {
    buildKanoOfflineSurveyModel,
    kanoOfflineSurveyFileName,
    renderKanoOfflineSurveyHtml,
} from '@/lib/kano-offline-survey';

const log = createLogger('api/kano-offline-survey');

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId);
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true },
        });
        if (!project) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        const requirements = await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
            select: {
                id: true,
                category: true,
                requirement: true,
                kanoPositiveQ: true,
                kanoNegativeQ: true,
            },
        });
        if (requirements.length === 0) {
            return NextResponse.json({ error: '먼저 고객요구사항을 등록하세요.' }, { status: 400 });
        }

        const html = renderKanoOfflineSurveyHtml(buildKanoOfflineSurveyModel({
            projectId,
            projectName: project.name,
            requirements,
        }));
        const fileName = encodeURIComponent(kanoOfflineSurveyFileName(project.name));

        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        log.error('Kano 오프라인 설문지 생성 실패', error, { projectId });
        return NextResponse.json({ error: '오프라인 설문지 생성에 실패했습니다.' }, { status: 500 });
    }
}
