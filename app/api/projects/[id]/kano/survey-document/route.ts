import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { buildKanoSurveyDocumentModel, kanoSurveyFileName } from '@/lib/kano-survey-document';
import { renderKanoSurveyDocx } from '@/lib/kano-survey-docx';

const log = createLogger('api/kano-survey-document');

// 종이 설문지(.docx)를 내려준다. 온라인 설문을 쓰기 어려운 현장 조사용이다.
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

        // 화면의 「설문 질문 구성」과 같은 순서다. 저장하지 않은 편집은 여기 없다.
        const requirements = await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
            select: { requirement: true, kanoPositiveQ: true, kanoNegativeQ: true },
        });

        const buffer = await renderKanoSurveyDocx(buildKanoSurveyDocumentModel(requirements));
        const fileName = encodeURIComponent(kanoSurveyFileName(project.name));

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        log.error('Kano 설문지 문서 생성 실패', error, { projectId });
        return NextResponse.json({ error: '설문지 문서 생성에 실패했습니다.' }, { status: 500 });
    }
}
