'use client';
// 저장된 워크시트의 개별 양식 또는 전체 엑셀 파일을 내려받는다.
import { useRef, useState } from 'react';

export default function WorksheetExcelDownload({ projectId, worksheetId, disabled = false }: { projectId: string; worksheetId?: string; disabled?: boolean }) {
    const downloading = useRef(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function download() {
        if (downloading.current) return;
        downloading.current = true;
        setBusy(true);
        setError(null);
        try {
            const query = new URLSearchParams({ format: 'xlsx' });
            if (worksheetId) query.set('worksheet', worksheetId);
            const response = await fetch(`/api/projects/${projectId}/export?${query}`, { cache: 'no-store' });
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error ?? '엑셀 파일을 만들지 못했습니다. 다시 시도해 주세요.');
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            try {
                link.href = url;
                const name = response.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
                link.download = name ? decodeURIComponent(name) : '워크시트.xlsx';
                document.body.append(link);
                link.click();
            } finally {
                link.remove();
                URL.revokeObjectURL(url);
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '엑셀 다운로드에 실패했습니다.');
        } finally {
            downloading.current = false;
            setBusy(false);
        }
    }

    return <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void download()} disabled={busy || disabled} className="btn-secondary text-sm disabled:opacity-50" title="저장된 워크시트 내용을 엑셀 양식으로 내려받습니다.">
            {busy ? '엑셀 만드는 중...' : worksheetId ? '엑셀 다운로드' : '전체 워크시트 엑셀'}
        </button>
        {worksheetId && <span className="text-xs text-gray-400">엑셀은 저장된 내용으로 출력됩니다.</span>}
        {error && <p role="alert" className="w-full text-sm text-red-500">{error}</p>}
    </div>;
}
