'use client';
// 질문 답변을 외부 AI에 붙여 넣을 기능분석 프롬프트로 만드는 팝업이다.
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import {
    buildFunctionAnalysisPrompt,
    createFunctionAnalysisAnswers,
    FUNCTION_ANALYSIS_SOURCE_URL,
    FUNCTION_ANALYSIS_STEPS,
    validateFunctionAnalysisStep,
    type FunctionAnalysisAnswers,
    type FunctionAnalysisSpecRow,
} from '@/lib/function-analysis-prompt';

interface Props {
    open: boolean;
    project?: { name?: string; description?: string } | null;
    existingRows: readonly FunctionAnalysisSpecRow[];
    onClose: () => void;
}

export default function FunctionAnalysisAssistant({ open, project, existingRows, onClose }: Props) {
    const [answers, setAnswers] = useState<FunctionAnalysisAnswers>(() => createFunctionAnalysisAnswers(project));
    const [stepIndex, setStepIndex] = useState(0);
    const [includeExisting, setIncludeExisting] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copyStatus, setCopyStatus] = useState<'copying' | 'copied' | 'manual' | 'selected' | null>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    const stepHeading = useRef<HTMLHeadingElement>(null);
    const errorNotice = useRef<HTMLParagraphElement>(null);
    const promptField = useRef<HTMLTextAreaElement>(null);
    const copying = useRef(false);
    const id = useId();
    const isPreview = stepIndex === FUNCTION_ANALYSIS_STEPS.length;
    const step = FUNCTION_ANALYSIS_STEPS[stepIndex];
    const availableRows = useMemo(() => existingRows.filter(row => [row.core, row.sub, row.detail, row.technology].some(value => value.trim())), [existingRows]);
    const prompt = useMemo(() => {
        try { return buildFunctionAnalysisPrompt(answers, includeExisting ? availableRows : []); }
        catch { return ''; }
    }, [answers, includeExisting, availableRows]);

    useEffect(() => {
        const element = dialog.current;
        if (!open || !element) return;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (!element.open) element.showModal();
        return () => {
            if (element.open) element.close();
            previousFocus?.focus({ preventScroll: true });
        };
    }, [open]);

    useEffect(() => {
        if (open) stepHeading.current?.focus();
    }, [open, stepIndex]);

    useEffect(() => {
        if (error) errorNotice.current?.focus();
    }, [error]);

    useEffect(() => { setCopyStatus(null); }, [prompt]);

    function updateAnswer(key: keyof FunctionAnalysisAnswers, value: string) {
        setAnswers(previous => ({ ...previous, [key]: value }));
        setError(null);
        setCopyStatus(null);
    }

    function advance(event: FormEvent) {
        event.preventDefault();
        if (isPreview) return;
        const message = validateFunctionAnalysisStep(answers, stepIndex);
        if (message) { setError(message); return; }
        if (stepIndex === FUNCTION_ANALYSIS_STEPS.length - 1) {
            try { buildFunctionAnalysisPrompt(answers, includeExisting ? availableRows : []); }
            catch (cause) {
                setError(cause instanceof Error ? cause.message : '입력 내용을 확인해 주세요.');
                return;
            }
        }
        setError(null);
        setCopyStatus(null);
        setStepIndex(previous => previous + 1);
    }

    async function copyPrompt() {
        if (!prompt || copying.current) return;
        copying.current = true;
        setCopyStatus('copying');
        try {
            await navigator.clipboard.writeText(prompt);
            setCopyStatus('copied');
        } catch {
            setCopyStatus('manual');
        } finally {
            copying.current = false;
        }
    }

    function selectPrompt() {
        const field = promptField.current;
        if (!field) return;
        field.focus();
        field.select();
        field.setSelectionRange(0, field.value.length);
        setCopyStatus('selected');
    }

    return <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }}
        aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
        className="w-[calc(100%_-_2rem)] max-w-3xl overflow-hidden rounded-xl border border-white/10 bg-gray-950 p-0 text-white shadow-2xl backdrop:bg-black/70">
        <form onSubmit={advance} noValidate className="flex max-h-[88vh] flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-6 py-5">
                <div>
                    <h2 id={`${id}-title`} className="text-lg font-semibold">기능분석 작성 도우미</h2>
                    <p id={`${id}-description`} className="mt-1 text-sm text-gray-400">질문에 답하면 Claude·OpenAI에 붙여 넣을 프롬프트를 만듭니다.</p>
                </div>
                <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white" aria-label="기능분석 작성 도우미 닫기">닫기</button>
            </div>

            <div className="min-h-0 space-y-6 overflow-y-auto px-6 py-5">
                <ol aria-label="작성 단계" className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    {[...FUNCTION_ANALYSIS_STEPS.map(item => item.title), '프롬프트 검토'].map((title, index) => <li key={title}
                        aria-current={stepIndex === index ? 'step' : undefined}
                        className={`rounded-lg border px-3 py-2 ${stepIndex === index ? 'border-primary-500/40 bg-primary-500/15 text-primary-200' : 'border-white/10 text-gray-500'}`}>
                        {index + 1}. {title}
                    </li>)}
                </ol>
                <div>
                    <h3 ref={stepHeading} tabIndex={-1} className="text-base font-semibold outline-none">{isPreview ? '프롬프트 검토·복사' : `${stepIndex + 1}단계. ${step.title}`}</h3>
                    <p className="mt-1 text-xs text-gray-400">{isPreview ? '복사한 프롬프트를 Claude 또는 OpenAI의 대화창에 붙여 넣어 분석을 요청하세요.' : '필수 항목은 반드시 입력해 주세요. 선택 항목을 모르면 비워 둘 수 있습니다.'}</p>
                </div>

                {error && <p ref={errorNotice} tabIndex={-1} role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 outline-none">{error}</p>}

                {!isPreview && <>
                    <div className="space-y-5">
                        {step.fields.map(field => <div key={field.key}>
                            <label htmlFor={`${id}-${field.key}`} className="block text-sm font-medium text-gray-200">
                                {field.label} <span className={field.required ? 'text-amber-300' : 'text-gray-500'}>{field.required ? '(필수)' : '(선택)'}</span>
                            </label>
                            <p id={`${id}-${field.key}-question`} className="mt-1 text-sm text-gray-300">{field.question}</p>
                            {field.key === 'productName' ? <input id={`${id}-${field.key}`} value={answers[field.key]} onChange={event => updateAnswer(field.key, event.target.value)}
                                required={field.required} maxLength={field.maxLength} placeholder={field.placeholder}
                                aria-describedby={`${id}-${field.key}-question ${id}-${field.key}-hint`} className="input mt-2 block w-full" />
                                : <textarea id={`${id}-${field.key}`} value={answers[field.key]} onChange={event => updateAnswer(field.key, event.target.value)}
                                    required={field.required} maxLength={field.maxLength} placeholder={field.placeholder} rows={3}
                                    aria-describedby={`${id}-${field.key}-question ${id}-${field.key}-hint`} className="input mt-2 block w-full resize-y" />}
                            <div className="mt-1 flex items-start justify-between gap-3 text-xs text-gray-500">
                                <p id={`${id}-${field.key}-hint`}>{field.hint}</p>
                                <span className="shrink-0 tabular-nums">{answers[field.key].length.toLocaleString()}/{field.maxLength.toLocaleString()}</span>
                            </div>
                        </div>)}
                    </div>

                    {stepIndex === FUNCTION_ANALYSIS_STEPS.length - 1 && availableRows.length > 0 && <section className="space-y-3 rounded-lg border border-white/10 p-4">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-200">
                            <input type="checkbox" checked={includeExisting} onChange={event => { setIncludeExisting(event.target.checked); setCopyStatus(null); }} />
                            현재 WS-2 내용 포함
                        </label>
                        <p className="text-xs text-gray-400">{includeExisting ? '아래 내용을 참고 자료로 프롬프트에 포함합니다.' : '현재 WS-2 내용은 프롬프트에서 제외됩니다.'}</p>
                        {includeExisting && <div className="max-h-64 overflow-auto">
                            <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                                <thead><tr>{['핵심기술', '세부기술', '세세부기술', '적용기술'].map(title => <th key={title} className="border border-white/10 bg-white/5 px-3 py-2 font-medium text-gray-300">{title}</th>)}</tr></thead>
                                <tbody>{availableRows.map((row, index) => <tr key={index}>{[row.core, row.sub, row.detail, row.technology].map((value, column) => <td key={column} className="whitespace-pre-wrap break-words border border-white/10 px-3 py-2 text-gray-400">{value || '—'}</td>)}</tr>)}</tbody>
                            </table>
                        </div>}
                    </section>}
                </>}

                {isPreview && <div className="space-y-4">
                    <div className="rounded-lg border border-primary-500/20 bg-primary-500/5 p-3 text-sm text-gray-300">
                        <p>모델마다 분석 내용은 달라질 수 있습니다. 이 프롬프트는 분석 절차와 결과 표의 구조를 맞추는 데 사용합니다.</p>
                        <p className="mt-2 text-xs text-gray-400">{includeExisting && availableRows.length > 0 ? `현재 WS-2 내용 ${availableRows.length}개 행이 포함되어 있습니다.` : '현재 WS-2 내용은 포함되지 않았습니다.'}</p>
                    </div>
                    <label className="block text-sm font-medium text-gray-200" htmlFor={`${id}-prompt`}>생성된 기능분석 프롬프트</label>
                    <textarea ref={promptField} id={`${id}-prompt`} readOnly value={prompt} rows={18} spellCheck={false} className="input block w-full resize-y font-mono text-xs leading-relaxed" />
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => void copyPrompt()} disabled={copyStatus === 'copying' || !prompt} className="btn-primary text-sm disabled:opacity-50">{copyStatus === 'copying' ? '복사 중...' : '프롬프트 복사'}</button>
                        <button type="button" onClick={selectPrompt} disabled={!prompt} className="btn-secondary text-sm disabled:opacity-50">전체 선택</button>
                    </div>
                    {copyStatus === 'copied' && <p role="status" className="text-sm text-emerald-300">프롬프트를 복사했습니다. Claude 또는 OpenAI에 붙여 넣어 주세요.</p>}
                    {copyStatus === 'manual' && <p role="alert" className="text-sm text-amber-300">자동 복사를 사용할 수 없습니다. ‘전체 선택’을 누른 뒤 Ctrl+C(또는 ⌘+C)로 복사해 주세요.</p>}
                    {copyStatus === 'selected' && <p role="status" className="text-sm text-gray-300">프롬프트 전체를 선택했습니다. Ctrl+C(또는 ⌘+C)로 복사해 주세요.</p>}
                    <a href={FUNCTION_ANALYSIS_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-gray-400 underline hover:text-white">기능분석 방법 참고 자료</a>
                </div>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
                <p className="text-xs text-gray-500">답변은 이 페이지를 벗어나기 전까지 유지됩니다.</p>
                <div className="flex items-center gap-2">
                    {stepIndex > 0 && <button type="button" disabled={copyStatus === 'copying'} onClick={() => { setStepIndex(previous => previous - 1); setError(null); setCopyStatus(null); }} className="btn-secondary text-sm disabled:opacity-50">{isPreview ? '답변 수정' : '이전'}</button>}
                    {!isPreview && <button type="submit" className="btn-primary text-sm">{stepIndex === FUNCTION_ANALYSIS_STEPS.length - 1 ? '프롬프트 만들기' : '다음'}</button>}
                </div>
            </div>
        </form>
    </dialog>;
}
