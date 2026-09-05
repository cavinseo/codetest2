// 프로젝트의 Kano 오프라인 HTML 설문지를 첨부 파일로 내려주는 라우트다.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { buildKanoOfflineFormHtml, kanoOfflineFormFileName } from '@/lib/kano-offline-form';

const log = createLogger('api/kano-offline-form');

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

        // 오프라인 설문도 화면과 같은 질문 순서여야 저장본의 문항 위치가 일치한다.
        const requirements = await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
            select: { requirement: true, kanoPositiveQ: true, kanoNegativeQ: true },
        });
        if (requirements.length === 0) {
            return NextResponse.json(
                { error: '먼저 고객요구사항을 등록하세요.' },
                { status: 400 }
            );
        }

        const html = buildKanoOfflineFormHtml({
            projectId,
            projectName: project.name,
            requirements,
        });
        const fileName = kanoOfflineFormFileName(project.name);

        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        log.error('Kano 설문지 문서 생성 실패', error, { projectId });
        return NextResponse.json(
            { error: '설문지 문서 생성에 실패했습니다.' },
            { status: 500 }
        );
    }
}
