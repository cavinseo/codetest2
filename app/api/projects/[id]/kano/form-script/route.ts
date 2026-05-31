import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { buildKanoGoogleFormScript } from '@/lib/kano-google-form-script';

const log = createLogger('api/kano-form-script');

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
            select: {
                name: true,
                requirements: {
                    orderBy: { order: 'asc' },
                    select: {
                        category: true,
                        subcategory: true,
                        requirement: true,
                        kanoPositiveQ: true,
                        kanoNegativeQ: true,
                    },
                },
            },
        });

        if (!project) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        if (project.requirements.length === 0) {
            return NextResponse.json({ error: '먼저 고객요구사항을 등록하세요.' }, { status: 400 });
        }

        const script = buildKanoGoogleFormScript(project.requirements, project.name);
        const fileName = encodeURIComponent('Kano_GoogleForms_생성_스크립트.gs');

        return new NextResponse(script, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        log.error('Kano Google Forms script download failed', error);
        return NextResponse.json({ error: 'Google Forms 생성 스크립트 다운로드에 실패했습니다.' }, { status: 500 });
    }
}
