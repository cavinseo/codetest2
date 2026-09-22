import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { renderFinalReportDocx } from '@/lib/final-report-docx';
import { REPORT_MAX_BYTES, reportDocumentSchema } from '@/lib/final-report-payload';

const log = createLogger('api/report-docx');

// 결과보고서 모델(캡처 이미지·교정된 블록 포함)을 화면에서 그대로 받아 .docx 로
// 직렬화해 내려준다. docx 패키지는 브라우저에서 번들되면 깨지므로(클래스 필드가
// SWC 다운레벨에서 'super' 파싱 오류를 낸다) 여기서만 불러온다 — Kano 설문지
// 다운로드와 같은 방식이다. 모델 조립(워크시트 캡처 등)은 여전히 화면에서 한다.
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId);
    if (accessResult instanceof NextResponse) return accessResult;

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
        const parsed = reportDocumentSchema.safeParse(input);
        if (!parsed.success) {
            return NextResponse.json({ error: '결과보고서 데이터 형식이 올바르지 않습니다.' }, { status: 400 });
        }

        const model = parsed.data;
        const blob = await renderFinalReportDocx(model);
        const buffer = await blob.arrayBuffer();
        const fileName = encodeURIComponent(model.fileName);

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
