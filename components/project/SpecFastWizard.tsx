'use client';
// WS-2 AS-IS 스펙표의 "FAST 작성 지원" 창. 세부설명·원하는 기능을 받아 FAST 결과표 초안을 만들고
// (서버 엔진, 안 되면 내 PC 의 로컬 AI 를 브라우저로 경유), 확정한 행만 스펙표로 넘긴다.
//
// 스펙표(SpecTable)가 이 창의 상태 12개와 처리 함수 10여 개를 함께 들고 있어 1300줄을 넘었다
// (2026-10-25 코드 리뷰 L3). 창의 상태는 스펙표와 나누지 않으므로 떼어 낸다. 결과는 onApply 로만
// 돌려준다.
import { useMemo, useRef, useState } from 'react';
import { readBusinessPlanForSpec } from '@/lib/business-plan-sections';
import { describeAiEngine } from '@/lib/ai/engine-label';
import {
    BrowserLocalError,
    callBrowserLocalLlm,
    discoverBrowserLocalEndpoint,
} from '@/lib/ai/browser-local';
import {
    buildFlatSpecRowsFromFunctions,
    groupSpecRows,
    renameSpecGroup,
    type FlatSpecRowLike,
    type SpecFunctionLike,
} from '@/lib/spec-table-utils';

type SpecAiWizardStep = 'guide' | 'questions' | 'review' | 'fast';

// 서버가 로컬 엔진에 못 붙었을 때 내려주는 봉투. 브라우저가 이걸로 자기 PC의 LLM 을 부른다.
interface BrowserRelayEnvelope {
    task: string;
    prompts: { system: string; user: string };
    candidateBaseUrls: string[];
    preferredModel?: string;
}

interface SpecDraftResponse {
    specFunctions?: SpecFunctionLike[];
    issues?: SpecAiIssue[];
    contextSummary?: SpecAiContextSummary | null;
    provider?: string;
    degraded?: boolean;
    browserRelay?: BrowserRelayEnvelope;
}

interface SpecAiContextSummary {
    keywords?: string[];
    customerNeedCount?: number;
    productAttributeCount?: number;
    existingSpecCount?: number;
    qfdTechnicalCount?: number;
    targetSpecCount?: number;
}

interface SpecAiIssue {
    severity: 'info' | 'warning' | 'error';
    message: string;
    specId?: string;
}

export interface SpecFastWizardProps {
    projectId: string;
    project: { name: string; description?: string; detailedDescription?: string } | null;
    /** 안내 화면에 보여 줄 기존 스펙표 행 수 */
    existingRowCount: number;
    open: boolean;
    onClose: () => void;
    /** "확정 후 표에 반영"으로 고른 FAST 결과표 행. 받은 쪽이 표에 넣고 창을 닫는다. */
    onApply: (rows: FlatSpecRowLike[]) => void;
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function SpecFastWizard({ projectId, project, existingRowCount, open, onClose, onApply, showToast }: SpecFastWizardProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiDetailInput, setAiDetailInput] = useState('');
    const [aiWizardStep, setAiWizardStep] = useState<SpecAiWizardStep>('guide');
    const [aiQuestionInput, setAiQuestionInput] = useState({
        desiredFunctions: '',
    });
    const [aiFastRows, setAiFastRows] = useState<FlatSpecRowLike[]>([]);
    const [aiIssues, setAiIssues] = useState<SpecAiIssue[]>([]);
    const [aiContextSummary, setAiContextSummary] = useState<SpecAiContextSummary | null>(null);
    // 어떤 엔진이 이 초안을 만들었는지 결과 화면에 배지로 보여준다.
    const [aiEngineLabel, setAiEngineLabel] = useState('');
    // 브라우저 경유 호출은 최대 90초 걸릴 수 있어 진행 상황을 알려주고 취소도 받는다.
    const [relayStatus, setRelayStatus] = useState('');
    const relayAbortRef = useRef<AbortController | null>(null);

    // 개요에 저장된 사업계획 내용을 FAST 입력칸으로 옮긴다.
    // 양식으로 채운 경우 핵심 기능 구획이 있어 원하는 기능까지 자동으로 채워진다.
    const businessPlanForSpec = useMemo(
        () => readBusinessPlanForSpec(project?.detailedDescription),
        [project?.detailedDescription]
    );

    // 창을 열 때마다 첫 단계로 돌리고 입력칸을 개요로 채운다. 세부설명은 전에 적던 것이 있으면
    // 그대로 둔다. 창은 닫혀도 사라지지 않으므로(적던 세부설명을 지키려고) 열림이 바뀌는 순간에
    // 맞춘다 — 렌더 중 상태 조정이라 effect 를 한 번 더 돌리지 않는다.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setAiWizardStep('guide');
            setAiDetailInput(prev => prev || businessPlanForSpec.detailText || project?.description || '');
            setAiQuestionInput({
                desiredFunctions: businessPlanForSpec.desiredFunctions,
            });
            setAiFastRows([]);
        }
    }

    const aiGroupedRows = useMemo(() => groupSpecRows(aiFastRows), [aiFastRows]);

    const handleAutoGenerate = async () => {
        const additionalDescription = aiDetailInput.trim();
        const desiredFunctions = aiQuestionInput.desiredFunctions.trim();
        if (!additionalDescription || !desiredFunctions) {
            showToast('세부설명과 원하는 기능을 모두 입력하세요.', 'error');
            return;
        }

        setAiIssues([]);
        setAiContextSummary(null);
        setAiEngineLabel('');
        setIsGenerating(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/spec/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'draft',
                    additionalDescription,
                    structuredInput: {
                        productService: project?.name || '',
                        currentFunctions: desiredFunctions,
                    },
                }),
            });
            if (!res.ok) {
                showToast('FAST 결과표 생성에 실패했습니다.', 'error');
                return;
            }

            const data = await res.json();

            // 서버가 로컬 엔진에 못 붙어 브라우저 경유를 제안했으면, 내 PC의 LLM 을 직접 부른다.
            // 실패하면 이미 응답에 담겨 온 규칙 기반 결과를 그대로 쓴다.
            if (data.browserRelay) {
                const relayed = await tryBrowserRelay(data.browserRelay, additionalDescription);
                applyDraftResult(relayed ?? data);
                return;
            }

            applyDraftResult(data);
        } catch (error) {
            console.error('FAST 결과표 생성 실패:', error);
            showToast('FAST 결과표 생성에 실패했습니다.', 'error');
        } finally {
            setIsGenerating(false);
            setRelayStatus('');
        }
    };

    const applyDraftResult = (data: SpecDraftResponse) => {
        setAiFastRows(buildFlatSpecRowsFromFunctions(data.specFunctions || []));
        setAiIssues(data.issues || []);
        setAiContextSummary(data.contextSummary || null);
        setAiEngineLabel(describeAiEngine(data));
        setAiWizardStep('fast');
        showToast('FAST 결과표 초안을 만들었습니다. 수정 후 확정하세요.', 'info');
    };

    // 성공하면 서버가 검증까지 마친 결과를, 실패하면 null 을 돌려준다.
    const tryBrowserRelay = async (
        relay: BrowserRelayEnvelope,
        additionalDescription: string
    ): Promise<SpecDraftResponse | null> => {
        const controller = new AbortController();
        relayAbortRef.current = controller;

        try {
            setRelayStatus('내 PC에서 로컬 AI를 찾는 중...');
            const endpoint = await discoverBrowserLocalEndpoint(
                relay.candidateBaseUrls,
                relay.preferredModel,
                controller.signal
            );
            if (!endpoint) {
                showToast(
                    '로컬 AI를 찾지 못해 기본 엔진으로 만들었습니다. Ollama·LM Studio 실행 여부와 CORS 설정을 확인하세요.',
                    'info'
                );
                return null;
            }

            setRelayStatus(`${endpoint.model} 모델로 생성 중... (최대 90초)`);
            const content = await callBrowserLocalLlm(endpoint, relay.prompts, { signal: controller.signal });

            setRelayStatus('결과를 검증하는 중...');
            const res = await fetch(`/api/projects/${projectId}/spec/generate/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, additionalDescription }),
            });
            if (!res.ok) {
                showToast('로컬 AI 응답 형식이 맞지 않아 기본 엔진 결과를 사용합니다.', 'info');
                return null;
            }
            return await res.json();
        } catch (error) {
            const message = error instanceof BrowserLocalError
                ? error.message
                : '로컬 AI 호출에 실패했습니다.';
            showToast(`${message} 기본 엔진 결과를 사용합니다.`, 'info');
            return null;
        } finally {
            relayAbortRef.current = null;
        }
    };

    const applyBusinessPlanToWizard = () => {
        setAiDetailInput(businessPlanForSpec.detailText || project?.description || '');
        setAiQuestionInput({ desiredFunctions: businessPlanForSpec.desiredFunctions });
    };

    const applySelectedDraft = () => {
        if (aiFastRows.length === 0) {
            showToast('반영할 FAST 양식 행이 없습니다.', 'error');
            return;
        }

        onApply(aiFastRows);
        showToast(`FAST 양식 ${aiFastRows.length}행을 표에 반영했습니다. 저장 버튼을 눌러 확정하세요.`, 'success');
    };

    const updateAiFastRow = (id: string, field: keyof FlatSpecRowLike, value: string) => {
        setAiFastRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
    };

    const deleteAiFastRow = (id: string) => {
        setAiFastRows(prev => prev.filter(row => row.id !== id));
    };

    const addAiFastRow = () => {
        setAiFastRows(prev => [...prev, {
            id: Math.random().toString(36).slice(2),
            core: '',
            sub: '',
            detail: '',
            technology: '',
        }]);
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4">
            <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-xl border border-white/10 bg-gray-950 shadow-2xl">
                <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
                    <div>
                        <h3 className="text-lg font-semibold text-white">WS-2 FAST 작성 지원</h3>
                        <p className="mt-1 text-sm text-gray-400">
                            세부설명과 원하는 기능을 바탕으로 FAST 결과표를 만들고, 확정된 내용만 본 페이지 표에 반영합니다.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isGenerating}
                        className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-white disabled:opacity-50"
                        aria-label="닫기"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                    <div className="grid grid-cols-4 gap-2 text-xs">
                        {[
                            ['guide', '1. 안내'],
                            ['questions', '2. 입력'],
                            ['review', '3. 검토'],
                            ['fast', '4. FAST 결과표'],
                        ].map(([step, label]) => (
                            <div key={step} className={`rounded-md px-3 py-2 text-center font-semibold ${aiWizardStep === step ? 'bg-accent-600 text-white' : 'bg-white/[0.04] text-gray-500'}`}>
                                {label}
                            </div>
                        ))}
                    </div>

                    {aiWizardStep === 'guide' && (
                        <div className="space-y-4">
                            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 text-sm leading-6 text-blue-100">
                                <p className="font-semibold text-white">작성에 필요한 내용 안내.</p>
                                <p className="mt-2">프로젝트명, 프로젝트 설명, 기존 WS-2 항목은 자동으로 참고합니다. 추가로는 세부설명과 원하는 기능만 입력하면 FAST 결과표를 핵심기능, 세부기능, 세세부기능, 적용기술 순서로 제시합니다.</p>
                            </div>
                            <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                    <p className="text-xs text-gray-500">제품/서비스</p>
                                    <p className="mt-1 text-sm text-white">{project?.name || '미입력'}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                    <p className="text-xs text-gray-500">프로젝트 설명</p>
                                    <p className="mt-1 line-clamp-3 text-sm text-white">{project?.description || '미입력'}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                    <p className="text-xs text-gray-500">기존 WS-2 행</p>
                                    <p className="mt-1 text-sm text-white">{existingRowCount}행</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {aiWizardStep === 'questions' && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary-500/25 bg-primary-500/10 px-3 py-2.5">
                                <p className="text-xs text-primary-200">
                                    {businessPlanForSpec.hasSections
                                        ? '개요의 사업계획 내용(고객 정의 · 고객 문제 · 핵심 기능)을 불러올 수 있습니다.'
                                        : '개요에 상세 제품개요가 있으면 아래 칸으로 불러올 수 있습니다.'}
                                </p>
                                <button
                                    type="button"
                                    onClick={applyBusinessPlanToWizard}
                                    disabled={isGenerating || !businessPlanForSpec.detailText}
                                    className="btn-secondary flex-shrink-0 text-xs disabled:opacity-40"
                                >
                                    제품개요 불러오기
                                </button>
                            </div>
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-gray-400">세부설명</span>
                                <textarea
                                    value={aiDetailInput}
                                    onChange={e => setAiDetailInput(e.target.value)}
                                    disabled={isGenerating}
                                    className="min-h-[160px] w-full resize-y rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm leading-6 text-white outline-none focus:border-accent-500 disabled:opacity-60"
                                    placeholder="아이템의 배경, 사용 상황, 고객 문제, 현재 보유한 정보나 기술, 반드시 고려해야 할 제약을 입력하세요."
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-gray-400">원하는 기능</span>
                                <textarea
                                    value={aiQuestionInput.desiredFunctions}
                                    onChange={(event) => setAiQuestionInput({ desiredFunctions: event.target.value })}
                                    disabled={isGenerating}
                                    className="min-h-[120px] w-full resize-y rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm leading-6 text-white outline-none focus:border-accent-500 disabled:opacity-60"
                                    placeholder="예: 고객 문의 자동 분류, 전문가 추천, 결과 리포트 생성처럼 원하는 기능을 줄바꿈 또는 쉼표로 입력하세요."
                                />
                            </label>
                            {relayStatus && (
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2.5">
                                    <p className="text-xs text-cyan-100">{relayStatus}</p>
                                    <button
                                        type="button"
                                        onClick={() => relayAbortRef.current?.abort()}
                                        className="flex-shrink-0 rounded-lg px-3 py-1.5 text-xs text-cyan-200 hover:bg-white/10"
                                    >
                                        기다리지 않고 기본 엔진 결과 보기
                                    </button>
                                </div>
                            )}
                            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-gray-400">
                                기본 아이템 정보는 프로젝트와 기존 워크시트에서 불러오며, 위 두 항목은 FAST 결과표를 구체화하는 데만 사용됩니다.
                            </div>
                        </div>
                    )}

                    {aiWizardStep === 'review' && (
                        <div className="space-y-3">
                            {[
                                ['세부설명', aiDetailInput || '미입력'],
                                ['원하는 기능', aiQuestionInput.desiredFunctions || '미입력'],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                    <p className="text-xs font-semibold text-gray-500">{label}</p>
                                    <p className="mt-1 whitespace-pre-line text-sm text-white">{value}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {aiWizardStep === 'fast' && (
                        <div className="space-y-4">
                            {aiEngineLabel && (
                                <div className="flex items-center gap-2">
                                    <span className="badge-primary text-[10px]">{aiEngineLabel}</span>
                                    <span className="text-xs text-gray-500">이 초안을 만든 엔진</span>
                                </div>
                            )}
                            {aiContextSummary && (
                                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs leading-5 text-cyan-100">
                                    <div>참고 데이터: 제품속성 {aiContextSummary.productAttributeCount ?? 0}개, 고객요구 {aiContextSummary.customerNeedCount ?? 0}개, 기존스펙 {aiContextSummary.existingSpecCount ?? 0}개</div>
                                    {aiContextSummary.keywords?.length ? <div className="mt-1">키워드: {aiContextSummary.keywords.join(', ')}</div> : null}
                                </div>
                            )}
                            {aiIssues.length > 0 && (
                                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100">
                                    {aiIssues.slice(0, 4).map((issue, index) => <p key={index}>- {issue.message}</p>)}
                                </div>
                            )}
                            <div className="overflow-auto rounded-lg border border-white/10">
                                <table className="w-full min-w-[900px] border-collapse text-xs">
                                    <thead className="bg-gray-900">
                                        <tr>
                                            <th className="border border-white/10 p-2 text-left">핵심기능</th>
                                            <th className="border border-white/10 p-2 text-left">세부기능</th>
                                            <th className="border border-white/10 p-2 text-left">세세부기능</th>
                                            <th className="border border-white/10 p-2 text-left">적용기술</th>
                                            <th className="border border-white/10 p-2 w-[56px]" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {aiGroupedRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="border border-white/10 p-6 text-center text-gray-500">생성된 FAST 결과표가 없습니다.</td>
                                            </tr>
                                        ) : aiGroupedRows.map((row, index) => (
                                            <tr key={row.id}>
                                                {row.coreRowSpan > 0 && (
                                                    <td className="border border-white/10 p-0 align-top bg-blue-950/10" rowSpan={row.coreRowSpan}>
                                                        <input
                                                            type="text"
                                                            value={row.core}
                                                            onChange={(event) => setAiFastRows(renameSpecGroup(aiFastRows, index, 'core', event.target.value))}
                                                            className="w-full bg-transparent px-3 py-2 text-blue-100 outline-none focus:bg-white/[0.04]"
                                                        />
                                                    </td>
                                                )}
                                                {row.subRowSpan > 0 && (
                                                    <td className="border border-white/10 p-0 align-top bg-purple-950/10" rowSpan={row.subRowSpan}>
                                                        <input
                                                            type="text"
                                                            value={row.sub}
                                                            onChange={(event) => setAiFastRows(renameSpecGroup(aiFastRows, index, 'sub', event.target.value))}
                                                            className="w-full bg-transparent px-3 py-2 text-purple-100 outline-none focus:bg-white/[0.04]"
                                                        />
                                                    </td>
                                                )}
                                                <td className="border border-white/10 p-0">
                                                    <input
                                                        type="text"
                                                        value={row.detail}
                                                        onChange={(event) => updateAiFastRow(row.id, 'detail', event.target.value)}
                                                        className="w-full bg-transparent px-3 py-2 text-emerald-100 outline-none focus:bg-white/[0.04]"
                                                    />
                                                </td>
                                                <td className="border border-white/10 p-0">
                                                    <input
                                                        type="text"
                                                        value={row.technology}
                                                        onChange={(event) => updateAiFastRow(row.id, 'technology', event.target.value)}
                                                        className="w-full bg-transparent px-3 py-2 text-amber-100 outline-none focus:bg-white/[0.04]"
                                                    />
                                                </td>
                                                <td className="border border-white/10 p-2 text-center">
                                                    <button type="button" onClick={() => deleteAiFastRow(row.id)} className="text-rose-400 hover:text-rose-300">삭제</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <button type="button" onClick={addAiFastRow} className="btn-secondary text-sm">행 추가</button>
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isGenerating}
                        className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white disabled:opacity-50"
                    >
                        취소
                    </button>
                    {aiWizardStep === 'guide' && (
                        <button type="button" onClick={() => setAiWizardStep('questions')} className="btn-primary">입력 시작</button>
                    )}
                    {aiWizardStep === 'questions' && (
                        <button type="button" onClick={() => setAiWizardStep('review')} className="btn-primary">입력 내용 검토</button>
                    )}
                    {aiWizardStep === 'review' && (
                        <>
                            <button type="button" onClick={() => setAiWizardStep('questions')} className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-white/5">입력 수정</button>
                            <button type="button" onClick={handleAutoGenerate} disabled={isGenerating} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                                {isGenerating ? '생성 중...' : 'FAST 결과표 제시'}
                            </button>
                        </>
                    )}
                    {aiWizardStep === 'fast' && (
                        <>
                            <button type="button" onClick={() => setAiWizardStep('questions')} className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-white/5">입력 수정</button>
                            <button type="button" onClick={applySelectedDraft} disabled={isGenerating || aiFastRows.length === 0} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                                확정 후 표에 반영
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
