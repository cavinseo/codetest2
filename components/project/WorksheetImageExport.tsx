'use client';
// 현재 워크시트의 표와 그래프를 밝은 배경의 PNG 그림으로 내려받는다.
import { useRef, useState, type ReactNode } from 'react';
import { captureWorksheetNode, downloadWorksheetImage, waitForWorksheetReady } from '@/lib/worksheet-capture';

interface Props {
    title: string;
    worksheetId: string;
    children: ReactNode;
    readOnly?: boolean;
    captureWidth?: number;
    disabled?: boolean;
}

export default function WorksheetImageExport({ title, worksheetId, children, readOnly = false, captureWidth, disabled = false }: Props) {
    const content = useRef<HTMLDivElement>(null);
    const capturing = useRef(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function download() {
        if (!content.current || capturing.current) return;
        const node = content.current;
        capturing.current = true;
        setBusy(true);
        setError(null);
        try {
            await waitForWorksheetReady(node, title);
            const image = await captureWorksheetNode(node.querySelector('main') ?? node);
            downloadWorksheetImage(title, image.pngDataUrl);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '그림을 만들지 못했습니다. 다시 시도해 주세요.');
        } finally {
            capturing.current = false;
            setBusy(false);
        }
    }

    return <section className="min-w-0 space-y-3">
        <div data-capture-exclude className="flex flex-wrap items-center justify-end gap-3 px-4 py-2">
            <span className="text-xs text-gray-400">현재 화면의 결과를 PNG로 저장합니다.</span>
            <button type="button" onClick={() => void download()} disabled={busy || disabled} className="btn-secondary text-sm disabled:opacity-50" aria-label={`${title} 그림 다운로드`}>
                {busy ? '그림 만드는 중...' : '그림 다운로드'}
            </button>
            {error && <p role="alert" className="w-full text-sm text-red-500">{error}</p>}
        </div>
        <div className="overflow-x-auto">
            <div ref={content} data-worksheet-id={worksheetId} inert={readOnly || busy || disabled} style={captureWidth ? { width: captureWidth } : undefined}>
                {children}
            </div>
        </div>
    </section>;
}
