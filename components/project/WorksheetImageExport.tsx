'use client';
// 현재 워크시트의 표와 그래프를 밝은 배경의 PNG 그림이나 A4 PDF 로 내려받는다.
import { useRef, useState, type ReactNode } from 'react';
import { captureWorksheetNode, downloadWorksheetImage, waitForWorksheetReady } from '@/lib/worksheet-capture';
import { isWorksheetPdfEnabled, worksheetPdfFileName } from '@/lib/worksheet-pdf-layout';
import { createWorksheetPdf } from '@/lib/worksheet-pdf';
import { kanoSurveyFileNameStem } from '@/lib/kano-survey-document';
import { downloadBlobAsFile } from '@/lib/file-download';
import WorksheetExcelDownload from './WorksheetExcelDownload';

interface Props {
    title: string;
    projectId?: string;
    worksheetId: string;
    children: ReactNode;
    readOnly?: boolean;
    captureWidth?: number;
    disabled?: boolean;
}

type ExportFormat = 'png' | 'pdf';

export default function WorksheetImageExport({ title, projectId, worksheetId, children, readOnly = false, captureWidth, disabled = false }: Props) {
    const content = useRef<HTMLDivElement>(null);
    const capturing = useRef(false);
    const [busy, setBusy] = useState<ExportFormat | null>(null);
    const [error, setError] = useState<string | null>(null);
    // 결과보고서 캡처 단계는 projectId 를 넘기지 않는다. 그 화면에 개별 PDF 버튼을 두지 않는다.
    const pdfEnabled = Boolean(projectId) && isWorksheetPdfEnabled(worksheetId);

    async function download(format: ExportFormat) {
        if (!content.current || capturing.current) return;
        const node = content.current;
        capturing.current = true;
        setBusy(format);
        setError(null);
        try {
            await waitForWorksheetReady(node, title);
            const image = await captureWorksheetNode(node.querySelector('main') ?? node);
            if (format === 'png') downloadWorksheetImage(title, image.pngDataUrl);
            else downloadBlobAsFile(await createWorksheetPdf(image), worksheetPdfFileName(kanoSurveyFileNameStem(title)));
        } catch (cause) {
            const fallback = format === 'png' ? '그림을 만들지 못했습니다. 다시 시도해 주세요.' : 'PDF를 만들지 못했습니다. 다시 시도해 주세요.';
            setError(cause instanceof Error ? cause.message : fallback);
        } finally {
            capturing.current = false;
            setBusy(null);
        }
    }

    return <section className="min-w-0 space-y-3">
        <div data-capture-exclude className="flex flex-wrap items-center justify-end gap-3 px-4 py-2">
            <span className="text-xs text-gray-400">{pdfEnabled ? '현재 화면의 결과를 PNG나 PDF로 저장합니다.' : '현재 화면의 결과를 PNG로 저장합니다.'}</span>
            <button type="button" onClick={() => void download('png')} disabled={Boolean(busy) || disabled} className="btn-secondary text-sm disabled:opacity-50" aria-label={`${title} 그림 다운로드`}>
                {busy === 'png' ? '그림 만드는 중...' : '그림 다운로드'}
            </button>
            {pdfEnabled && <button type="button" onClick={() => void download('pdf')} disabled={Boolean(busy) || disabled} className="btn-secondary text-sm disabled:opacity-50" aria-label={`${title} PDF 다운로드`}>
                {busy === 'pdf' ? 'PDF 만드는 중...' : 'PDF 다운로드'}
            </button>}
            {projectId && <WorksheetExcelDownload projectId={projectId} worksheetId={worksheetId} disabled={Boolean(busy) || disabled} />}
            {error && <p role="alert" className="w-full text-sm text-red-500">{error}</p>}
        </div>
        <div className="overflow-x-auto">
            <div ref={content} data-worksheet-id={worksheetId} inert={readOnly || Boolean(busy) || disabled} style={captureWidth ? { width: captureWidth } : undefined}>
                {children}
            </div>
        </div>
    </section>;
}
