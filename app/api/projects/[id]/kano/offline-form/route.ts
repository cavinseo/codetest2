// 프로젝트의 Kano 오프라인 HTML 설문지를 첨부 파일로 내려주는 라우트다.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { buildKanoOfflineFormHtml, kanoOfflineFormFileName } from '@/lib/kano-offline-form';
import { z } from 'zod';
import { EMPTY_KANO_INTRODUCTION, kanoSurveyIntroductionSchema } from '@/lib/kano-survey-introduction';

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
            select: { name: true, kanoSurveyIntroduction: true },
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
        const introduction = kanoSurveyIntroductionSchema.parse(project.kanoSurveyIntroduction ?? EMPTY_KANO_INTRODUCTION);
        if (request.nextUrl.searchParams.get('format') === 'json') {
            return NextResponse.json({
                projectId, projectName: project.name, requirements, introduction,
                canEdit: ['OWNER', 'EDITOR', 'ADMIN'].includes(accessResult.role),
            }, { headers: { 'Cache-Control': 'no-store' } });
        }
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
            introduction,
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

export async function PATCH(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;

    const parsed = z.object({ introduction: kanoSurveyIntroductionSchema }).strict()
        .safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: '소개문 항목을 각각 200자 이내의 텍스트로 입력해 주세요.' }, { status: 400 });
    }

    try {
        await prisma.project.update({
            where: { id: projectId },
            data: { kanoSurveyIntroduction: parsed.data.introduction },
        });
        return NextResponse.json({ introduction: parsed.data.introduction });
    } catch (error) {
        log.error('Kano 설문 소개문 저장 실패', error, { projectId });
        return NextResponse.json({ error: '소개문 저장에 실패했습니다. 다시 시도해 주세요.' }, { status: 500 });
    }
}
