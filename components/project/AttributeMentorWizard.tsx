'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    buildAppliedRows,
    buildSpecFunctionOptions,
    collectTechnologies,
    MENTOR_ANSWER_KEY_BY_QUESTION_ID,
    type MentorAppliedRow,
    type MentorDraftRow,
} from '@/lib/attribute-mentor-utils';
import type { AttributeSpecFunctionLike } from '@/lib/product-attributes-utils';
import { describeAiEngine } from '@/lib/ai/engine-label';

interface MentorQuestion {
    id: string;
    field: string;
    question: string;
    hint: string;
    examples: string[];
}

interface AttributeMentorWizardProps {
    projectId: string;
    specFunctions: AttributeSpecFunctionLike[];
    onApply: (rows: MentorAppliedRow[], technologies: string[]) => void;
    onClose: () => void;
    onNotify: (message: string, type: 'success' | 'error') => void;
}

type WizardStep = 'questions' | 'draft' | 'attributes' | 'technology';

const STEP_LABELS: Array<{ step: WizardStep; label: string }> = [
    { step: 'questions', label: '1. 문진' },
    { step: 'draft', label: '2. 초안 검토' },
    { step: 'attributes', label: '3. 기능 선택' },
    { step: 'technology', label: '4. 기술 확인' },
];

export default function AttributeMentorWizard({
    projectId,
    specFunctions,
    onApply,
    onClose,
    onNotify,
}: AttributeMentorWizardProps) {
    const [step, setStep] = useState<WizardStep>('questions');
    const [isLoading, setIsLoading] = useState(true);
    const [isWorking, setIsWorking] = useState(false);
    const [questions, setQuestions] = useState<MentorQuestion[]>([]);
    const [focus, setFocus] = useState('');
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [draftRows, setDraftRows] = useState<MentorDraftRow[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [attributesByRow, setAttributesByRow] = useState<Record<string, string[]>>({});
    const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
    const [customAttribute, setCustomAttribute] = useState('');
    const [engineLabel, setEngineLabel] = useState('');

    const specOptions = useMemo(() => buildSpecFunctionOptions(specFunctions), [specFunctions]);

    const loadQuestions = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/attributes/mentor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'questions' }),
            });
            if (!res.ok) throw new Error('문진 질문을 불러오지 못했습니다.');

            const data = await res.json();
            setQuestions(data.questions || []);
            setFocus(data.focus || '');
            setEngineLabel(describeEngine(data));
        } catch (error) {
            onNotify(error instanceof Error ? error.message : '문진 질문을 불러오지 못했습니다.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [projectId, onNotify]);

    useEffect(() => {
        loadQuestions();
    }, [loadQuestions]);

    const generateDraft = async () => {
        const payload: Record<string, string> = {};
        for (const [questionId, answerKey] of Object.entries(MENTOR_ANSWER_KEY_BY_QUESTION_ID)) {
            payload[answerKey] = answers[questionId] ?? '';
        }

        if (!payload.marketSegments?.trim()) {
            onNotify('세분시장은 반드시 입력해야 초안을 만들 수 있습니다.', 'error');
            return;
        }

        setIsWorking(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/attributes/mentor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'draft', answers: payload }),
            });
            if (!res.ok) throw new Error('초안 생성에 실패했습니다.');

            const data = await res.json();
            const rows: MentorDraftRow[] = (data.rows || []).map((row: Record<string, string>, index: number) => ({
                id: `mentor_${index}_${Math.random().toString(36).slice(2, 6)}`,
                marketSegment: row.marketSegment || '',
                customerName: row.customerName || '',
                customerNeed: row.customerNeed || '',
                benefit: row.benefit || '',
            }));

            if (rows.length === 0) {
                onNotify('초안이 비어 있습니다. 세분시장 답변을 확인해 주세요.', 'error');
                return;
            }

            setDraftRows(rows);
            setSelectedIds(new Set(rows.map((row) => row.id)));
            setFocusedRowId(rows[0].id);
            setEngineLabel(describeEngine(data));
            setStep('draft');

            for (const issue of data.issues || []) {
                if (issue.severity === 'error') onNotify(issue.message, 'error');
            }
        } catch (error) {
            onNotify(error instanceof Error ? error.message : '초안 생성에 실패했습니다.', 'error');
        } finally {
            setIsWorking(false);
        }
    };

    const updateDraftRow = (id: string, field: keyof MentorDraftRow, value: string) => {
        setDraftRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    };

    const toggleRow = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAttribute = (rowId: string, name: string) => {
        setAttributesByRow((prev) => {
            const current = prev[rowId] ?? [];
            const next = current.includes(name)
                ? current.filter((item) => item !== name)
                : [...current, name];
            return { ...prev, [rowId]: next };
        });
    };

    const addCustomAttribute = () => {
        const value = customAttribute.trim();
        if (!value || !focusedRowId) return;

        setAttributesByRow((prev) => {
            const current = prev[focusedRowId] ?? [];
            if (current.includes(value)) return prev;
            return { ...prev, [focusedRowId]: [...current, value] };
        });
        setCustomAttribute('');
    };

    const technologies = useMemo(
        () => collectTechnologies(specFunctions, attributesByRow, selectedIds),
        [specFunctions, attributesByRow, selectedIds]
    );

    const appliedRows = useMemo(
        () => buildAppliedRows(draftRows, selectedIds, attributesByRow),
        [draftRows, selectedIds, attributesByRow]
    );

    const handleApply = () => {
        if (appliedRows.length === 0) {
            onNotify('적용할 행이 없습니다. 2단계에서 행을 선택하세요.', 'error');
            return;
        }
        onApply(appliedRows, technologies);
    };

    const focusedRow = draftRows.find((row) => row.id === focusedRowId) ?? null;
    const selectedCount = selectedIds.size;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="glass-strong max-w-5xl w-full max-h-[88vh] overflow-hidden flex flex-col rounded-2xl border border-white/[0.1]">
                {/* 헤더 + 단계 표시 */}
                <div className="flex items-start justify-between px-6 py-4 border-b border-white/[0.08] flex-shrink-0 bg-white/[0.02]">
                    <div>
                        <h3 className="text-base font-display font-bold text-white flex items-center gap-2">
                            <svg className="w-5 h-5 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            AI 멘토링 — 제품속성서 작성
                        </h3>
                        <div className="flex items-center gap-2 mt-2">
                            {STEP_LABELS.map((item) => (
                                <span
                                    key={item.step}
                                    className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${step === item.step
                                        ? 'border-accent-500/40 bg-accent-500/15 text-accent-200'
                                        : 'border-white/[0.06] text-gray-600'
                                        }`}
                                >
                                    {item.label}
                                </span>
                            ))}
                            {engineLabel && (
                                <span className="text-[11px] px-2 py-1 rounded-md border border-white/[0.06] text-gray-500">
                                    {engineLabel}
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                        title="닫기"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-auto flex-1 px-6 py-5">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="animate-spin h-8 w-8 border-2 border-accent-500 border-t-transparent rounded-full" />
                        </div>
                    ) : step === 'questions' ? (
                        <div className="space-y-4">
                            {focus && (
                                <div className="rounded-lg border border-accent-500/20 bg-accent-500/[0.06] px-4 py-3">
                                    <p className="text-xs text-accent-200">{focus}</p>
                                </div>
                            )}
                            {questions.map((question) => (
                                <div key={question.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                                    <p className="text-sm text-white font-medium">{question.question}</p>
                                    {question.hint && <p className="text-[11px] text-gray-500 mt-1">{question.hint}</p>}
                                    {question.examples.length > 0 && (
                                        <p className="text-[11px] text-gray-600 mt-1">
                                            예) {question.examples.join(' · ')}
                                        </p>
                                    )}
                                    <textarea
                                        value={answers[question.id] ?? ''}
                                        onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                                        rows={question.id === 'segmentation-basis' ? 2 : 3}
                                        className="w-full mt-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm text-gray-200 outline-none focus:border-accent-500/40 focus:bg-white/[0.05] transition-colors resize-y"
                                        placeholder="한 줄에 하나씩 입력하세요"
                                    />
                                </div>
                            ))}
                        </div>
                    ) : step === 'draft' ? (
                        <div className="space-y-3">
                            <p className="text-xs text-gray-500">
                                답변을 표 행으로 정리했습니다. 필요 없는 행은 체크를 해제하고, 문구는 직접 고칠 수 있습니다.
                            </p>
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                                        <th className="px-3 py-2 text-gray-500 text-xs w-[44px]">선택</th>
                                        <th className="px-3 py-2 text-gray-400 text-xs text-left">세분시장</th>
                                        <th className="px-3 py-2 text-gray-400 text-xs text-left">고객명</th>
                                        <th className="px-3 py-2 text-gray-400 text-xs text-left">고객 니즈</th>
                                        <th className="px-3 py-2 text-gray-400 text-xs text-left">제공혜택</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {draftRows.map((row) => (
                                        <tr key={row.id} className="border-b border-white/[0.04]">
                                            <td className="px-3 py-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(row.id)}
                                                    onChange={() => toggleRow(row.id)}
                                                    className="accent-accent-500"
                                                />
                                            </td>
                                            {(['marketSegment', 'customerName', 'customerNeed', 'benefit'] as const).map((field) => (
                                                <td key={field} className="p-0">
                                                    <input
                                                        type="text"
                                                        value={row[field]}
                                                        onChange={(e) => updateDraftRow(row.id, field, e.target.value)}
                                                        className="w-full px-3 py-2 bg-transparent text-sm text-gray-200 outline-none focus:bg-white/[0.04] transition-colors"
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : step === 'attributes' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* 왼쪽: 행 목록 */}
                            <div className="space-y-2">
                                <p className="text-xs text-gray-500">행을 고른 뒤, 오른쪽에서 해당하는 WS-2 기능을 선택하세요.</p>
                                {draftRows.filter((row) => selectedIds.has(row.id)).map((row) => {
                                    const picked = attributesByRow[row.id] ?? [];
                                    return (
                                        <button
                                            key={row.id}
                                            type="button"
                                            onClick={() => setFocusedRowId(row.id)}
                                            className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${focusedRowId === row.id
                                                ? 'border-accent-500/40 bg-accent-500/10'
                                                : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                                                }`}
                                        >
                                            <p className="text-sm text-white">{row.customerName || '(고객명 없음)'}</p>
                                            <p className="text-[11px] text-gray-500 mt-0.5">{row.marketSegment}</p>
                                            <p className={`text-[11px] mt-1 ${picked.length > 0 ? 'text-cyan-300' : 'text-gray-600'}`}>
                                                {picked.length > 0 ? picked.join(', ') : '선택된 기능 없음'}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* 오른쪽: WS-2 기능 목록 */}
                            <div className="space-y-2">
                                {specOptions.length === 0 ? (
                                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
                                        <p className="text-xs text-amber-200">
                                            WS-2 AS-IS 스펙이 없습니다. 아래에 직접 입력해 추가하세요.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="max-h-[320px] overflow-auto rounded-lg border border-white/[0.06]">
                                        {specOptions.map((option) => {
                                            const picked = focusedRowId ? (attributesByRow[focusedRowId] ?? []).includes(option.name) : false;
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    disabled={!focusedRowId}
                                                    onClick={() => focusedRowId && toggleAttribute(focusedRowId, option.name)}
                                                    className={`w-full text-left px-3 py-2 border-b border-white/[0.04] transition-colors disabled:opacity-40 ${picked ? 'bg-cyan-500/10' : 'hover:bg-white/[0.03]'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${option.level === 'DETAIL'
                                                            ? 'bg-emerald-500/15 text-emerald-300'
                                                            : 'bg-purple-500/15 text-purple-300'
                                                            }`}>
                                                            {option.level === 'DETAIL' ? '세세부' : '세부'}
                                                        </span>
                                                        <span className={`text-sm ${picked ? 'text-cyan-200' : 'text-gray-300'}`}>{option.name}</span>
                                                    </div>
                                                    {option.technology && (
                                                        <p className="text-[11px] text-amber-300/70 mt-1 ml-1">기술: {option.technology}</p>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={customAttribute}
                                        onChange={(e) => setCustomAttribute(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addCustomAttribute();
                                            }
                                        }}
                                        disabled={!focusedRowId}
                                        className="flex-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm text-gray-200 outline-none focus:border-cyan-500/40 disabled:opacity-40"
                                        placeholder="목록에 없으면 직접 추가"
                                    />
                                    <button
                                        type="button"
                                        onClick={addCustomAttribute}
                                        disabled={!focusedRowId || !customAttribute.trim()}
                                        className="btn-secondary text-sm disabled:opacity-40"
                                    >
                                        추가
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                                <h4 className="text-sm text-white font-semibold">표에 추가될 행 {appliedRows.length}개</h4>
                                <div className="mt-3 max-h-[220px] overflow-auto">
                                    <table className="w-full border-collapse text-xs">
                                        <tbody>
                                            {appliedRows.map((row, index) => (
                                                <tr key={index} className="border-b border-white/[0.04]">
                                                    <td className="px-2 py-1.5 text-gray-500">{row.marketSegment}</td>
                                                    <td className="px-2 py-1.5 text-gray-300">{row.customerName}</td>
                                                    <td className="px-2 py-1.5 text-cyan-300">{row.attribute || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-4">
                                <h4 className="text-sm text-amber-300 font-semibold">자동으로 불러온 적용 기술 {technologies.length}개</h4>
                                <p className="text-[11px] text-gray-500 mt-1">
                                    선택한 기능에 연결된 WS-2 적용기술입니다. 기술 역량 칸에 추가됩니다.
                                </p>
                                {technologies.length === 0 ? (
                                    <p className="text-xs text-gray-600 mt-3">연결된 기술이 없습니다.</p>
                                ) : (
                                    <ul className="mt-3 space-y-1">
                                        {technologies.map((technology) => (
                                            <li key={technology} className="text-xs text-amber-200">· {technology}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* 하단 버튼 */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.08] flex-shrink-0 bg-white/[0.02]">
                    <span className="text-[11px] text-gray-600">
                        {step === 'draft' || step === 'attributes' ? `${selectedCount}개 행 선택됨` : ''}
                    </span>
                    <div className="flex items-center gap-2">
                        {step !== 'questions' && (
                            <button
                                type="button"
                                onClick={() => setStep(previousStep(step))}
                                className="btn-secondary text-sm"
                            >
                                이전
                            </button>
                        )}
                        {step === 'questions' && (
                            <button
                                type="button"
                                onClick={generateDraft}
                                disabled={isWorking}
                                className="btn-primary text-sm disabled:opacity-50"
                            >
                                {isWorking ? '생성 중...' : '초안 만들기'}
                            </button>
                        )}
                        {step === 'draft' && (
                            <button
                                type="button"
                                onClick={() => setStep('attributes')}
                                disabled={selectedCount === 0}
                                className="btn-primary text-sm disabled:opacity-50"
                            >
                                기능 선택으로
                            </button>
                        )}
                        {step === 'attributes' && (
                            <button
                                type="button"
                                onClick={() => setStep('technology')}
                                className="btn-primary text-sm"
                            >
                                기술 확인으로
                            </button>
                        )}
                        {step === 'technology' && (
                            <button
                                type="button"
                                onClick={handleApply}
                                className="btn-primary text-sm"
                            >
                                표에 적용
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function previousStep(step: WizardStep): WizardStep {
    if (step === 'technology') return 'attributes';
    if (step === 'attributes') return 'draft';
    return 'questions';
}

function describeEngine(data: { provider?: string; degraded?: boolean }): string {
    return describeAiEngine(data);
}
