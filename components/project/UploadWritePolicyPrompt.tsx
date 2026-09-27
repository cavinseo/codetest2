'use client';
// 워크시트 업로드의 추가·교체·취소 선택을 WS-2와 같은 안내 영역으로 표시한다.
export type UploadWritePolicy = 'append' | 'replace';

interface Props {
    fileName: string;
    targetLabel: string;
    isUploading: boolean;
    onSelect: (policy: UploadWritePolicy) => void;
    onCancel: () => void;
    title?: string;
    replaceDescription?: string;
    onReplaceRespondents?: () => void;
}

export default function UploadWritePolicyPrompt({
    fileName, targetLabel, isUploading, onSelect, onCancel,
    title = '엑셀 양식 업로드', replaceDescription, onReplaceRespondents,
}: Props) {
    return (
        <section aria-label={title} aria-busy={isUploading} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-emerald-100">{title}</h3>
                    <p className="mt-1 break-words text-xs text-emerald-200/70">
                        {fileName} 파일을 {targetLabel}로 반영할 방식을 선택하세요.
                    </p>
                    {replaceDescription && <p className="mt-1 text-xs text-amber-200">{replaceDescription}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => onSelect('append')} disabled={isUploading}
                        className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50">
                        {isUploading ? '업로드 중...' : '기존 데이터에 추가'}
                    </button>
                    <button type="button" onClick={() => onSelect('replace')} disabled={isUploading}
                        className="px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 text-sm font-semibold text-white disabled:opacity-50">
                        기존 데이터 지우고 업로드
                    </button>
                    {onReplaceRespondents && <button type="button" onClick={onReplaceRespondents} disabled={isUploading}
                        className="btn-secondary text-sm disabled:opacity-50">
                        같은 응답자의 기존 응답만 교체
                    </button>}
                    <button type="button" onClick={onCancel} disabled={isUploading}
                        className="px-3 py-1.5 text-sm text-gray-300 hover:text-white disabled:opacity-50">
                        취소
                    </button>
                </div>
            </div>
        </section>
    );
}
