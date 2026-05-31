import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/import-template');

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await params;
    const accessResult = await requireProjectAccess(request, projectId);
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const workbookPath = path.join(process.cwd(), 'public', 'asset', '워크시트.xlsx');
        const workbook = await readFile(workbookPath);
        const fileName = encodeURIComponent('워크시트_업로드_양식.xlsx');

        return new NextResponse(workbook, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        log.error('Import template download failed', error);
        return NextResponse.json(
            { error: '업로드 양식 다운로드에 실패했습니다.' },
            { status: 500 }
        );
    }
}
