'use client';
// WS-6 오프라인 양식의 소개문을 편집·저장하고 실제 HTML을 미리 보여 준다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildKanoOfflineFormHtml, type KanoOfflineFormInput } from '@/lib/kano-offline-form';
import {
    EMPTY_KANO_INTRODUCTION,
    KANO_INTRODUCTION_FIELDS,
    KANO_INTRODUCTION_MAX_LENGTH,
    type KanoSurveyIntroduction,
} from '@/lib/kano-survey-introduction';

interface Props {
    projectId: string;
    onClose: () => void;
}

export default function KanoOfflineFormPreview({ projectId, onClose }: Props) {
    const endpoint = `/api/projects/${projectId}/kano/offline-form`;
    const [data, setData] = useState<(KanoOfflineFormInput & { canEdit: boolean }) | null>(null);
    const [introduction, setIntroduction] = useState<KanoSurveyIntroduction>(EMPTY_KANO_INTRODUCTION);
    const [savedIntroduction, setSavedIntroduction] = useState<KanoSurveyIntroduction>(EMPTY_KANO_INTRODUCTION);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [reload, setReload] = useState(0);
    const previewRef = useRef<HTMLIFrameElement>(null);
    const dirty = JSON.stringify(introduction) !== JSON.stringify(savedIntroduction);

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
                setIntroduction(result.introduction);
                setSavedIntroduction(result.introduction);
            } catch (reason) {
                if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '양식을 불러오지 못했습니다.');
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        }
        void load();
        return () => controller.abort();
    }, [endpoint, reload]);

    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const html = useMemo(() => data ? buildKanoOfflineFormHtml({ ...data, introduction, preview: true }) : '', [data, introduction]);

    async function save() {
        setIsSaving(true);
        setError('');
        setMessage('');
        try {
            const response = await fetch(endpoint, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ introduction }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '소개문 저장에 실패했습니다.');
            setIntroduction(result.introduction);
            setSavedIntroduction(result.introduction);
            setMessage('저장했습니다. 오프라인 HTML에 반영됩니다.');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '소개문 저장에 실패했습니다. 다시 시도해 주세요.');
        } finally {
            setIsSaving(false);
        }
    }

    function close() {
        if (dirty && !window.confirm('저장하지 않은 소개문이 있습니다. 변경 내용을 버리고 닫을까요?')) return;
        onClose();
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <section role="dialog" aria-modal="true" aria-labelledby="offline-preview-title" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white text-gray-900 shadow-2xl">
                <header className="border-b border-gray-200 px-6 py-4">
                    <h2 id="offline-preview-title" className="text-xl font-bold">오프라인 양식 확인</h2>
                    <p className="mt-1 text-sm text-gray-600">소개문의 빈칸을 입력하고 저장하면 이후 내려받는 HTML 양식에도 반영됩니다.</p>
                </header>
                <div className="overflow-y-auto p-6">
                    {isLoading ? <p role="status">양식을 불러오는 중입니다.</p> : data && <>
                        <fieldset disabled={!data.canEdit || isSaving} className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <legend className="mb-3 font-semibold">제품/서비스 소개</legend>
                            {KANO_INTRODUCTION_FIELDS.map(({ key, label }) => (
                                <label key={key} htmlFor={`offline-intro-${key}`} className="flex flex-col gap-1 text-sm font-medium">
                                    {label}
                                    <input id={`offline-intro-${key}`} type="text" value={introduction[key]} maxLength={KANO_INTRODUCTION_MAX_LENGTH}
                                        placeholder={`${label} 입력`}
                                        onChange={event => {
                                            setIntroduction(previous => ({ ...previous, [key]: event.target.value }));
                                            setMessage('');
                                        }}
                                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:bg-gray-100" />
                                </label>
                            ))}
                        </fieldset>
                        {!data.canEdit && <p className="mb-3 text-sm text-gray-600">읽기 전용입니다.</p>}
                        <p className="mb-3 text-sm text-gray-600">입력하지 않은 항목은 빈칸으로 남습니다. 아래에서 반영된 양식을 확인하세요.</p>
                        <iframe ref={previewRef} title="오프라인 설문지 미리보기" sandbox="allow-same-origin allow-modals" srcDoc={html} className="h-[52vh] min-h-[320px] w-full rounded-lg border border-gray-200" />
                    </>}
                    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
                    {!isLoading && !data && <button type="button" onClick={() => setReload(value => value + 1)} className="mt-3 rounded-lg bg-gray-100 px-4 py-2">다시 불러오기</button>}
                </div>
                <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
                    <p role="status" className="mr-auto text-sm text-gray-600">{isSaving ? '저장 중입니다.' : dirty ? '저장하지 않은 변경 사항이 있습니다.' : message}</p>
                    {data?.canEdit && <button type="button" onClick={save} disabled={!dirty || isSaving} className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white disabled:opacity-50">소개문 저장</button>}
                    {data && <button type="button" onClick={() => previewRef.current?.contentWindow?.print()} className="rounded-lg border border-gray-300 px-4 py-2 font-semibold">PDF 출력</button>}
                    {data && !dirty && !isSaving && data.requirements.length > 0
                        ? <a href={endpoint} className="rounded-lg border border-gray-300 px-4 py-2 font-semibold">오프라인 HTML 받기</a>
                        : <button type="button" disabled className="rounded-lg border border-gray-300 px-4 py-2 text-gray-400">오프라인 HTML 받기</button>}
                    <button type="button" onClick={close} disabled={isSaving} className="rounded-lg bg-gray-100 px-5 py-2 font-semibold disabled:opacity-50">닫기</button>
                </footer>
            </section>
        </div>
    );
}
