'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import {
    generateFundingAiDraft,
    parseSourceYear,
    type FundingAiDraftResult,
} from '@/lib/funding-ai-agent';

interface FundingPlan {
    id: string;
    category: string;
    item: string;
    year1: number;
    year2: number;
    year3: number;
    order: number;
}

interface FundingSource {
    id: string;
    category: string;
    year1: string;
    year2: string;
    year3: string;
    order: number;
}

interface FundingSourceYear {
    source: string;
    amount: string;
}

interface FundingTableProps {
    projectId: string;
    mode?: 'plan' | 'source';
}

const YEAR_FIELDS = ['year1', 'year2', 'year3'] as const;
type YearField = (typeof YEAR_FIELDS)[number];

const YEAR_LABELS: Record<YearField, string> = {
    year1: '1차년도(Y+1)',
    year2: '2차년도(Y+2)',
    year3: '3차년도(Y+3)',
};

const FUNDING_LABELS: Record<string, string> = {
    'R&D 지원금': '연구개발 지원금(R&D)',
    TIPS: '민간투자주도형 기술창업지원(TIPS)',
    VC: '벤처캐피털(VC)',
};

const PLAN_SERIES = [
    { field: 'year1' as const, label: 'Y+1', color: 'bg-cyan-400/90' },
    { field: 'year2' as const, label: 'Y+2', color: 'bg-blue-400/90' },
    { field: 'year3' as const, label: 'Y+3', color: 'bg-violet-400/90' },
];

const formatFundingLabel = (value: string) => FUNDING_LABELS[value] ?? value;
const encodeYear = (value: FundingSourceYear) => JSON.stringify(value);

const includesNormalized = (plan: FundingPlan, keyword: string) =>
    `${plan.category ?? ''} ${plan.item ?? ''}`.replace(/\s+/g, '').includes(keyword);

const isRevenuePlan = (plan: FundingPlan) => includesNormalized(plan, '매출');
const isTotalPlan = (plan: FundingPlan) => includesNormalized(plan, '합계');
const isCostPlan = (plan: FundingPlan) => !isRevenuePlan(plan) && !isTotalPlan(plan);

export default function FundingTable({ projectId, mode = 'plan' }: FundingTableProps) {
    const [plans, setPlans] = useState<FundingPlan[]>([]);
    const [sources, setSources] = useState<FundingSource[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [aiMessage, setAiMessage] = useState<string | null>(null);
    // 소요자금과 조달계획을 한 화면에서 함께 편집하므로 둘을 한 값으로 본다.
    const { markClean } = useUnsavedChanges({ plans, sources });

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/funding`);
            if (res.ok) {
                const data = await res.json();
                const nextPlans = data.plans || [];
                const nextSources = data.sources || [];
                setPlans(nextPlans);
                setSources(nextSources);
                markClean({ plans: nextPlans, sources: nextSources });
            }
        } catch (error) {
            console.error('Failed to load funding data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [projectId, markClean]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload = mode === 'plan' ? { plans } : { sources };
            const res = await fetch(`/api/projects/${projectId}/funding`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                setAiMessage('저장되었습니다.');
                await loadData();
            }
        } catch (error) {
            console.error('Failed to save funding data:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const updatePlan = (id: string, field: YearField, value: number) => {
        setPlans((prev) => prev.map((plan) => (plan.id === id ? { ...plan, [field]: value } : plan)));
    };

    const updateSourceYear = (id: string, field: YearField, part: keyof FundingSourceYear, value: string) => {
        setSources((prev) => prev.map((source) => {
            if (source.id !== id) return source;
            const year = parseSourceYear(source[field]);
            return { ...source, [field]: encodeYear({ ...year, [part]: value }) };
        }));
    };

    const sortedPlans = useMemo(() => [...plans].sort((a, b) => a.order - b.order), [plans]);
    const costPlans = useMemo(() => sortedPlans.filter(isCostPlan), [sortedPlans]);
    const revenuePlan = useMemo(() => sortedPlans.find(isRevenuePlan) ?? null, [sortedPlans]);
    const totalPlan = useMemo(() => sortedPlans.find(isTotalPlan) ?? null, [sortedPlans]);

    const planTotals = useMemo(
        () => YEAR_FIELDS.reduce((acc, field) => ({
            ...acc,
            [field]: costPlans.reduce((sum, plan) => sum + (Number(plan[field]) || 0), 0),
        }), {} as Record<YearField, number>),
        [costPlans]
    );

    const sourceTotals = useMemo(
        () => YEAR_FIELDS.reduce((acc, field) => ({
            ...acc,
            [field]: sources.reduce((sum, source) => sum + parseSourceYear(source[field]).amountNumber, 0),
        }), {} as Record<YearField, number>),
        [sources]
    );

    const maxPlanValue = Math.max(1, ...costPlans.flatMap((plan) => YEAR_FIELDS.map((field) => Number(plan[field]) || 0)));
    const totalRequiredCost = YEAR_FIELDS.reduce((sum, field) => sum + planTotals[field], 0);
    const sourceOptions = Array.from(
        new Set(
            sources
                .flatMap((source) => YEAR_FIELDS.map((field) => parseSourceYear(source[field]).source.trim()))
                .filter(Boolean)
        )
    );

    const applyAiResult = (result: FundingAiDraftResult) => {
        setPlans(result.plans);
        setSources(result.sources);
        const messages = [
            result.summary.filledPlanCells > 0 ? `소요자금 ${result.summary.filledPlanCells}칸을 채웠습니다.` : '',
            result.summary.filledSourceCells > 0 ? `조달계획 ${result.summary.filledSourceCells}칸을 채웠습니다.` : '',
            ...result.issues.map((issue) => issue.message),
        ].filter(Boolean);
        setAiMessage(messages.join(' ') || 'AI 초안이 반영되었습니다.');
    };

    const handleGenerateAiDraft = () => {
        applyAiResult(generateFundingAiDraft({ plans, sources }));
    };

    if (isLoading) {
        return <div className="p-8 text-center text-gray-400">로딩 중...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white">
                        {mode === 'plan' ? '[WS-16] 자금소요계획표' : '[WS-17] 자금조달계획표'}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                        {mode === 'plan'
                            ? '연차별 소요자금을 입력하고 합계와 그래프를 함께 확인합니다.'
                            : '연차별 조달 출처와 금액을 입력합니다.'}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={handleGenerateAiDraft} className="btn-secondary text-sm flex items-center gap-1.5">
                        AI 초안
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="btn-primary">
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                </div>
            </div>

            {aiMessage && (
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                    {aiMessage}
                </div>
            )}

            {mode === 'plan' ? (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
                    <div className="card overflow-hidden">
                        <div className="flex items-end justify-between border-b border-white/[0.06] px-6 py-4">
                            <div>
                                <h3 className="text-lg font-semibold text-white">자금소요계획</h3>
                                <p className="mt-1 text-xs text-gray-500">단위: 백만원</p>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                                <div>매출액은 WS-1과 연동됩니다.</div>
                                <div>소요자금 합계는 개별 항목 합산 기준입니다.</div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-white/[0.08] bg-white/[0.02] text-center text-gray-400">
                                        <th className="w-[150px] px-4 py-3 text-left">구분</th>
                                        <th className="w-[240px] px-4 py-3 text-left">항목</th>
                                        {YEAR_FIELDS.map((field) => (
                                            <th key={field} className="px-4 py-3">{YEAR_LABELS[field]}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {revenuePlan && (
                                        <tr className="border-b border-white/[0.05] bg-amber-500/[0.06]">
                                            <td className="px-4 py-3 text-sm font-medium text-amber-200">매출액</td>
                                            <td className="px-4 py-3 font-medium text-white">{formatFundingLabel(revenuePlan.item)}</td>
                                            {YEAR_FIELDS.map((field) => (
                                                <td key={field} className="px-4 py-3 text-right text-amber-100">
                                                    {(Number(revenuePlan[field]) || 0).toLocaleString()}
                                                </td>
                                            ))}
                                        </tr>
                                    )}

                                    {costPlans.map((plan, index) => (
                                        <tr key={plan.id} className="border-b border-white/[0.05]">
                                            <td className="px-4 py-3 text-sm text-gray-400">
                                                {index === 0 || costPlans[index - 1]?.category !== plan.category
                                                    ? formatFundingLabel(plan.category)
                                                    : ''}
                                            </td>
                                            <td className={`px-4 py-3 font-medium ${isTotalPlan(plan) ? 'text-orange-300' : 'text-white'}`}>
                                                {formatFundingLabel(plan.item)}
                                            </td>
                                            {YEAR_FIELDS.map((field) => (
                                                <td key={field} className="p-0">
                                                    <input
                                                        type="number"
                                                        value={Number(plan[field]) || ''}
                                                        onChange={(event) => updatePlan(plan.id, field, Number(event.target.value) || 0)}
                                                        className={`w-full bg-transparent px-4 py-3 text-right outline-none transition-colors focus:bg-white/[0.04] ${
                                                            isTotalPlan(plan) ? 'font-semibold text-orange-300' : 'text-white'
                                                        }`}
                                                        placeholder="0"
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="card">
                            <h3 className="text-base font-semibold text-white">연차별 소요자금 그래프</h3>
                            <div className="mt-5 space-y-4">
                                {PLAN_SERIES.map((series) => (
                                    <div key={series.field} className="space-y-1.5">
                                        <div className="flex items-center justify-between text-xs text-gray-400">
                                            <span>{series.label}</span>
                                            <span className="text-white">{planTotals[series.field].toLocaleString()}</span>
                                        </div>
                                        <div className="h-3 rounded-full bg-white/[0.05]">
                                            <div
                                                className={`h-3 rounded-full ${series.color}`}
                                                style={{ width: `${Math.max((planTotals[series.field] / maxPlanValue) * 100, 6)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="card">
                            <h3 className="text-base font-semibold text-white">핵심 요약</h3>
                            <div className="mt-4 grid grid-cols-1 gap-3">
                                {YEAR_FIELDS.map((field) => (
                                    <div key={field} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                                        <div className="text-xs text-gray-500">{YEAR_LABELS[field]}</div>
                                        <div className="mt-1 text-lg font-semibold text-white">
                                            {(totalPlan?.[field] ?? planTotals[field]).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3">
                                    <div className="text-xs text-cyan-200/70">3개년 총 소요자금</div>
                                    <div className="mt-1 text-lg font-semibold text-cyan-100">
                                        {totalRequiredCost.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
                    <div className="card overflow-hidden">
                        <div className="flex items-end justify-between border-b border-white/[0.06] px-6 py-4">
                            <div>
                                <h3 className="text-lg font-semibold text-white">자금조달계획</h3>
                                <p className="mt-1 text-xs text-gray-500">출처와 금액을 함께 관리합니다.</p>
                            </div>
                            <span className="text-xs text-gray-500">단위: 백만원</span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[960px] border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-white/[0.08] bg-white/[0.02] text-center text-gray-400">
                                        <th className="w-[190px] px-4 py-3 text-left">구분</th>
                                        {YEAR_FIELDS.map((field) => (
                                            <th key={field} className="px-4 py-3">{YEAR_LABELS[field]}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sources.map((source) => (
                                        <tr key={source.id} className="border-b border-white/[0.05] align-top">
                                            <td className="px-4 py-3 font-medium text-white">
                                                {formatFundingLabel(source.category)}
                                            </td>
                                            {YEAR_FIELDS.map((field) => {
                                                const year = parseSourceYear(source[field]);
                                                return (
                                                    <td key={field} className="p-0">
                                                        <div className="grid grid-cols-[minmax(140px,1fr)_110px] divide-x divide-white/[0.05]">
                                                            <input
                                                                type="text"
                                                                list={`source-options-${projectId}`}
                                                                value={year.source}
                                                                onChange={(event) => updateSourceYear(source.id, field, 'source', event.target.value)}
                                                                className="min-w-0 bg-transparent px-3 py-3 text-white outline-none focus:bg-white/[0.04]"
                                                                placeholder="출처"
                                                            />
                                                            <input
                                                                type="number"
                                                                value={year.amount}
                                                                onChange={(event) => updateSourceYear(source.id, field, 'amount', event.target.value)}
                                                                className="min-w-0 bg-transparent px-3 py-3 text-right text-white outline-none focus:bg-white/[0.04]"
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                    <tr className="bg-white/[0.03] font-semibold text-white">
                                        <td className="px-4 py-3">자금조달 합계</td>
                                        {YEAR_FIELDS.map((field) => (
                                            <td key={field} className="px-4 py-3 text-right">
                                                {sourceTotals[field].toLocaleString()}
                                            </td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                            <datalist id={`source-options-${projectId}`}>
                                {sourceOptions.map((option) => <option key={option} value={option} />)}
                            </datalist>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
