import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getFinalReportAccess } from '@/lib/final-report-access';
import { createLogger } from '@/lib/logger';
import { renderFinalReportDocx } from '@/lib/final-report-docx';
import { withReportOutputDate } from '@/lib/final-report-layout';
import { REPORT_MAX_BYTES, reportDocumentSchema, reportDraftSchema } from '@/lib/final-report-payload';

const log = createLogger('api/report-docx');

async function download(model: unknown, projectId: string) {
    try {
        const parsed = reportDocumentSchema.safeParse(model);
        if (!parsed.success) {
            return NextResponse.json({ error: '결과보고서 데이터 형식이 올바르지 않습니다.' }, { status: 400 });
        }
        const document = withReportOutputDate(parsed.data);
        const blob = await renderFinalReportDocx(document);
        const buffer = await blob.arrayBuffer();
        const fileName = encodeURIComponent(document.fileName);

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        log.error('결과보고서 문서 생성 실패', error, { projectId });
        return NextResponse.json({ error: '문서 생성에 실패했습니다.' }, { status: 500 });
    }
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const actor = await getFinalReportAccess(request, projectId);
    if (actor instanceof NextResponse) return actor;

    const draftView = request.nextUrl.searchParams.get('view') === 'draft';
    if (draftView && !actor.canReadDraft) {
        return NextResponse.json({ error: '초안을 열람할 권한이 없습니다.' }, { status: 403 });
    }
    const report = await prisma.finalReport.findUnique({ where: { projectId } });
    const storedDocument = draftView ? reportDraftSchema.safeParse(report?.draft).data?.document : report?.published;
    if (!storedDocument) return NextResponse.json({ error: '저장된 보고서가 없습니다.' }, { status: 404 });
    return download(storedDocument, projectId);
}

// 저장하지 않은 교정본은 배정 멘토만 내려받을 수 있다.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const actor = await getFinalReportAccess(request, projectId);
    if (actor instanceof NextResponse) return actor;
    if (!actor.canEdit) return NextResponse.json({ error: '배정된 멘토만 초안을 내려받을 수 있습니다.' }, { status: 403 });

    try {
        if (Number(request.headers.get('content-length')) > REPORT_MAX_BYTES) {
            return NextResponse.json({ error: '보고서 용량이 큽니다.' }, { status: 413 });
        }
        const raw = await request.text();
        if (Buffer.byteLength(raw, 'utf8') > REPORT_MAX_BYTES) {
            return NextResponse.json({ error: '보고서 용량이 큽니다.' }, { status: 413 });
        }
        let input: unknown;
        try { input = JSON.parse(raw); }
        catch { return NextResponse.json({ error: '결과보고서 데이터 형식이 올바르지 않습니다.' }, { status: 400 }); }
        return download(input, projectId);
    } catch (error) {
        log.error('결과보고서 문서 생성 실패', error, { projectId });
        return NextResponse.json({ error: '문서 생성에 실패했습니다.' }, { status: 500 });
    }
}
