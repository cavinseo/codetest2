import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { writeKanoInviteTemplateBuffer } from '@/lib/kano-invite-template';

const log = createLogger('api/kano-invite-template');

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

        const workbook = writeKanoInviteTemplateBuffer(project.name);
        const fileName = encodeURIComponent('Kano_응답자_초대명단_양식.xlsx');

        return new NextResponse(new Uint8Array(workbook), {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        log.error('Kano invite template download failed', error);
        return NextResponse.json({ error: '초대 명단 양식 다운로드에 실패했습니다.' }, { status: 500 });
    }
}
