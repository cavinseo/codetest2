import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireProjectAccess } from '@/lib/authorization';
import {
    IMPORT_TEMPLATE_FILE_NAMES,
    parseImportTemplateSheet,
    writeSingleImportTemplateSheetBuffer,
} from '@/lib/import-template-workbook';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/import-template');

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
    const arrayBuffer = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(arrayBuffer).set(buffer);
    return arrayBuffer;
}

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
        const requestedSheet = parseImportTemplateSheet(request.nextUrl.searchParams.get('sheet'));
        const responseWorkbook = requestedSheet
            ? writeSingleImportTemplateSheetBuffer(workbook, requestedSheet)
            : workbook;
        const fileName = encodeURIComponent(
            requestedSheet ? IMPORT_TEMPLATE_FILE_NAMES[requestedSheet] : '워크시트_업로드_양식.xlsx'
        );

        return new NextResponse(toArrayBuffer(responseWorkbook), {
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
