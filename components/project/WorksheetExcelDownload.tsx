'use client';
// 저장된 워크시트의 개별 양식 또는 전체 엑셀 파일을 내려받는다.
import { useRef, useState } from 'react';

async function fetchWorksheetExcel(projectId: string, worksheetId?: string) {
    const query = new URLSearchParams({ format: 'xlsx' });
    if (worksheetId) query.set('worksheet', worksheetId);
    const response = await fetch(`/api/projects/${projectId}/export?${query}`, { cache: 'no-store' });
    if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error ?? '엑셀 파일을 만들지 못했습니다. 다시 시도해 주세요.');
    }
    return response;
}

async function saveExcelResponse(response: Response) {
    const excelBlob = await response.blob();
    const downloadUrl = URL.createObjectURL(excelBlob);
    const downloadLink = document.createElement('a');
    try {
        downloadLink.href = downloadUrl;
        const encodedFileName = response.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        downloadLink.download = encodedFileName ? decodeURIComponent(encodedFileName) : '워크시트.xlsx';
        document.body.append(downloadLink);
        downloadLink.click();
    } finally {
        downloadLink.remove();
        URL.revokeObjectURL(downloadUrl);
    }
}

export default function WorksheetExcelDownload({ projectId, worksheetId, disabled = false }: { projectId: string; worksheetId?: string; disabled?: boolean }) {
    const downloadInProgress = useRef(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    async function downloadExcel() {
        if (downloadInProgress.current) return;
        downloadInProgress.current = true;
        setIsDownloading(true);
        setDownloadError(null);
        try {
            await saveExcelResponse(await fetchWorksheetExcel(projectId, worksheetId));
        } catch (cause) {
            setDownloadError(cause instanceof Error ? cause.message : '엑셀 다운로드에 실패했습니다.');
        } finally {
            downloadInProgress.current = false;
            setIsDownloading(false);
        }
    }

    return <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void downloadExcel()} disabled={isDownloading || disabled} className="btn-secondary text-sm disabled:opacity-50" title="저장된 워크시트 내용을 엑셀 양식으로 내려받습니다.">
            {isDownloading ? '엑셀 만드는 중...' : worksheetId ? '엑셀 다운로드' : '전체 워크시트 엑셀'}
        </button>
        {worksheetId && <span className="text-xs text-gray-400">엑셀은 저장된 내용으로 출력됩니다.</span>}
        {downloadError && <p role="alert" className="w-full text-sm text-red-500">{downloadError}</p>}
    </div>;
}
