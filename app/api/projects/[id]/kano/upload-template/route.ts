import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { writeKanoGoogleFormsTemplateBuffer, writeKanoUploadTemplateBuffer } from '@/lib/kano-upload-template';

const log = createLogger('api/kano-upload-template');

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

        const format = request.nextUrl.searchParams.get('format');
        const isGoogleForms = format === 'googleForms';
        const workbook = isGoogleForms
            ? writeKanoGoogleFormsTemplateBuffer(project.requirements, project.name)
            : writeKanoUploadTemplateBuffer(project.requirements, project.name);
        const fileName = encodeURIComponent(isGoogleForms ? 'Kano_GoogleForms_응답_업로드_양식.xlsx' : 'Kano_응답_업로드_양식.xlsx');

        return new NextResponse(new Uint8Array(workbook), {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        log.error('Kano upload template download failed', error);
        return NextResponse.json({ error: 'Kano 업로드 양식 다운로드에 실패했습니다.' }, { status: 500 });
    }
}
