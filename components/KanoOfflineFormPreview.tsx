'use client';
// WS-6 오프라인 양식을 내려받기 전에 실제 HTML 그대로 보여 준다.
//
// 소개문 입력은 「설문 질문 구성」 맨 앞으로 옮겼다. 여기서도 고칠 수 있으면 같은 값을 두 곳에서
// 편집하게 되고, 어느 쪽이 저장됐는지 헷갈린다. 이 창은 저장된 값으로 완성된 양식만 보여 준다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildKanoOfflineFormHtml, type KanoOfflineFormInput } from '@/lib/kano-offline-form';

interface Props {
    projectId: string;
    onClose: () => void;
}

export default function KanoOfflineFormPreview({ projectId, onClose }: Props) {
    const endpoint = `/api/projects/${projectId}/kano/offline-form`;
    const [data, setData] = useState<KanoOfflineFormInput | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const previewRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);
        setError('');
        async function load() {
            try {
                const response = await fetch(`${endpoint}?format=json`, { signal: controller.signal, cache: 'no-store' });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '양식을 불러오지 못했습니다.');
                if (controller.signal.aborted) return;
                setData(result);
            } catch (reason) {
                if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '양식을 불러오지 못했습니다.');
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        }
        void load();
        return () => controller.abort();
    }, [endpoint, reload]);

    const html = useMemo(() => data ? buildKanoOfflineFormHtml({ ...data, preview: true }) : '', [data]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <section role="dialog" aria-modal="true" aria-labelledby="offline-preview-title" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white text-gray-900 shadow-2xl">
                <header className="border-b border-gray-200 px-6 py-4">
                    <h2 id="offline-preview-title" className="text-xl font-bold">오프라인 양식 확인</h2>
                    <p className="mt-1 text-sm text-gray-600">소개문은 「설문 질문 구성」 맨 위에서 입력하고 「질문 저장」으로 저장합니다. 아래는 저장된 내용으로 완성된 양식입니다.</p>
                </header>
                <div className="overflow-y-auto p-6">
                    {isLoading ? <p role="status">양식을 불러오는 중입니다.</p> : data && (
                        <iframe ref={previewRef} title="오프라인 설문지 미리보기" sandbox="allow-same-origin allow-modals" srcDoc={html} className="h-[60vh] min-h-[320px] w-full rounded-lg border border-gray-200" />
                    )}
                    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
                    {!isLoading && !data && <button type="button" onClick={() => setReload(value => value + 1)} className="mt-3 rounded-lg bg-gray-100 px-4 py-2">다시 불러오기</button>}
                </div>
                <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
                    {data && <button type="button" onClick={() => previewRef.current?.contentWindow?.print()} className="rounded-lg border border-gray-300 px-4 py-2 font-semibold">PDF 출력</button>}
                    {data && data.requirements.length > 0
                        ? <a href={endpoint} className="rounded-lg border border-gray-300 px-4 py-2 font-semibold">오프라인 HTML 받기</a>
                        : <button type="button" disabled className="rounded-lg border border-gray-300 px-4 py-2 text-gray-400">오프라인 HTML 받기</button>}
                    <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-5 py-2 font-semibold">닫기</button>
                </footer>
            </section>
        </div>
    );
}
