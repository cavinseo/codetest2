'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MoneyInput from '@/components/ui/MoneyInput';
import { formatMoney } from '@/lib/money';
import { parseSourceYear } from '@/lib/funding-ai-agent';
import WorksheetLoadError from './WorksheetLoadError';
import FundingPlanChart from './FundingPlanChart';

interface FundingPlan {
    id: string;
    category: string;
    item: string;
    year1: number;
    year2: number | null;
    year3: number | null;
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

const SOURCE_CATEGORIES = ['정부자금', '엔젤투자금', '연구개발 지원금(R&D)', '민간투자주도형 기술창업지원(TIPS)', '벤처캐피털(VC)', '기타'];

const formatFundingLabel = (value: string) => FUNDING_LABELS[value] ?? value;
const encodeYear = (value: FundingSourceYear) => JSON.stringify(value);

const includesNormalized = (plan: FundingPlan, keyword: string) =>
    `${plan.category ?? ''} ${plan.item ?? ''}`.replace(/\s+/g, '').includes(keyword);

const isRevenuePlan = (plan: FundingPlan) => plan.category === '매출액' || plan.item === '매출액';
const isTotalPlan = (plan: FundingPlan) => includesNormalized(plan, '합계');
const isCostPlan = (plan: FundingPlan) => !isRevenuePlan(plan) && !isTotalPlan(plan);

export default function FundingTable({ projectId, mode = 'plan' }: FundingTableProps) {
    const [plans, setPlans] = useState<FundingPlan[]>([]);
    const [sources, setSources] = useState<FundingSource[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [canWrite, setCanWrite] = useState(false);
    const [aiMessage, setAiMessage] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setLoadFailed(false);
        try {
            const res = await fetch(`/api/projects/${projectId}/funding`);
            if (!res.ok) throw new Error('자금 계획 조회 실패');
            if (res.ok) {
                const data = await res.json();
                if (!Array.isArray(data.plans) || !Array.isArray(data.sources)) throw new Error('자금 계획 응답 형식 오류');
                setPlans(data.plans || []);
                setSources(data.sources || []);
                setCanWrite(data.canWrite === true);
                setLoadedProjectId(projectId);
            }
        } catch (error) {
            setLoadFailed(true);
            console.error('Failed to load funding data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSave = async () => {
        if (isLoading || isSaving || !canWrite || loadFailed || loadedProjectId !== projectId) return;
        setIsSaving(true);
        setAiMessage(null);
        try {
            const payload = mode === 'plan' ? { plans } : { sources: sourceGroups.flatMap(group => group.rows).map((source, order) => ({ ...source, order })) };
            const res = await fetch(`/api/projects/${projectId}/funding`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('저장 실패');
            setAiMessage('저장되었습니다.');
            await loadData();
        } catch (error) {
            console.error('Failed to save funding data:', error);
            setAiMessage('저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 저장해 주세요.');
        } finally {
            setIsSaving(false);
        }
    };

    const updatePlan = (id: string, field: YearField, value: number | null) => {
        setPlans((prev) => prev.map((plan) => (plan.id === id ? { ...plan, [field]: value } : plan)));
    };

    const updateSourceYear = (id: string, field: YearField, part: keyof FundingSourceYear, value: string) => {
        if (!canWrite || isSaving) return;
        setAiMessage(null);
        setSources((prev) => prev.map((source) => {
            if (source.id !== id) return source;
            const year = parseSourceYear(source[field]);
            return { ...source, [field]: encodeYear({ ...year, [part]: value }) };
        }));
    };

    const addSource = (category: string) => {
        if (!canWrite || isSaving) return;
        const id = crypto.randomUUID();
        setSources(previous => [...previous, { id, category, year1: '', year2: '', year3: '', order: Math.max(-1, ...previous.map(source => source.order)) + 1 }]);
        setAiMessage('세부항목을 추가했습니다. 출처와 금액을 입력한 뒤 저장해 주세요.');
    };

    const removeSource = (source: FundingSource) => {
        if (!canWrite || isSaving) return;
        const hasContent = YEAR_FIELDS.some(field => {
            const year = parseSourceYear(source[field]);
            return year.source.trim() !== '' || year.amountNumber !== 0;
        });
        if (hasContent && !window.confirm('이 세부항목의 1·2·3차년도 출처와 금액을 삭제할까요? 저장하면 반영됩니다.')) return;
        setSources(previous => previous.filter(row => row.id !== source.id));
        setAiMessage('세부항목을 삭제했습니다. 저장하면 반영됩니다.');
    };

    const sourceGroups = useMemo(() => {
        const groups = new Map<string, FundingSource[]>(SOURCE_CATEGORIES.map(category => [category, []]));
        for (const source of [...sources].sort((a, b) => a.order - b.order)) {
            const category = formatFundingLabel(source.category);
            if (!groups.has(category)) groups.set(category, []);
            groups.get(category)!.push(source);
        }
        return [...groups].map(([category, rows]) => ({ category, rows }));
    }, [sources]);

    const sortedPlans = useMemo(() => [...plans].sort((a, b) => a.order - b.order), [plans]);
    const costPlans = useMemo(() => sortedPlans.filter(isCostPlan), [sortedPlans]);
    const revenuePlan = useMemo(() => sortedPlans.find(isRevenuePlan) ?? null, [sortedPlans]);

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

    const totalRequiredCost = YEAR_FIELDS.reduce((sum, field) => sum + planTotals[field], 0);
    const sourceOptions = Array.from(
        new Set(
            sources
                .flatMap((source) => YEAR_FIELDS.map((field) => parseSourceYear(source[field]).source.trim()))
                .filter(Boolean)
        )
    );

    if (loadFailed) return <WorksheetLoadError onRetry={loadData} />;
    if (isLoading || loadedProjectId !== projectId) {
        return <div className="p-8 text-center text-gray-400">로딩 중...</div>;
    }

    return (
        <fieldset disabled={!canWrite || isSaving} className="min-w-0 space-y-6">
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
                    <button type="button" disabled className="btn-secondary text-sm flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50">
                        AI 초안 (사용 중지)
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
                <div className="space-y-6">
                    <div className="card overflow-hidden">
                        <div className="flex items-end justify-between border-b border-white/[0.06] px-6 py-4">
                            <div>
                                <h3 className="text-lg font-semibold text-white">자금소요계획</h3>
                                <p className="mt-1 text-xs text-gray-500">단위: 백만원</p>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                                <div>1차년도 매출액은 WS-1과 연동되며 2·3차년도는 직접 입력합니다.</div>
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
                                                    {field === 'year1' ? formatMoney(revenuePlan[field]) : <MoneyInput aria-label={YEAR_LABELS[field] + ' 매출액'} value={revenuePlan[field]} onValueChange={(value) => updatePlan(revenuePlan.id, field, value)} className="w-full min-w-[120px] bg-transparent text-right outline-none" placeholder="직접 입력" />}
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
                                                    <MoneyInput
                                                        aria-label={YEAR_LABELS[field] + ' ' + plan.item}
                                                        value={plan[field]}
                                                        onValueChange={(value) => updatePlan(plan.id, field, value ?? 0)}
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

                    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
                        <FundingPlanChart values={YEAR_FIELDS.map(field => ({ revenue: revenuePlan?.[field] ?? null, required: planTotals[field] }))} />
                        <div className="card">
                            <h3 className="text-base font-semibold text-white">핵심 요약</h3>
                            <div className="mt-4 grid grid-cols-1 gap-3">
                                {YEAR_FIELDS.map((field) => (
                                    <div key={field} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                                        <div className="text-xs text-gray-500">{YEAR_LABELS[field]}</div>
                                        <div className="mt-1 text-lg font-semibold text-white">
                                            {formatMoney(planTotals[field])}
                                        </div>
                                    </div>
                                ))}
                                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3">
                                    <div className="text-xs text-cyan-200/70">3개년 총 소요자금</div>
                                    <div className="mt-1 text-lg font-semibold text-cyan-100">
                                        {formatMoney(totalRequiredCost)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="w-full min-w-0">
                    <div className="card overflow-hidden">
                        <div className="flex items-end justify-between border-b border-white/[0.06] px-6 py-4">
                            <div>
                                <h3 className="text-lg font-semibold text-white">자금조달계획</h3>
                                <p className="mt-1 text-xs text-gray-500">구분별 세부항목을 추가하고 연차별 출처와 금액을 입력합니다. 추가·삭제 후 저장해 주세요.</p>
                            </div>
                            <span className="text-xs text-gray-500">단위: 백만원</span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1300px] border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-white/[0.08] bg-white/[0.02] text-center text-gray-400">
                                        <th className="min-w-[240px] w-[240px] px-4 py-3 text-left">구분</th>
                                        <th className="min-w-[100px] px-3 py-3">세부항목</th>
                                        {YEAR_FIELDS.map((field) => (
                                            <th key={field} className="px-4 py-3">{YEAR_LABELS[field]}</th>
                                        ))}
                                    </tr>
                                </thead>
                                {sourceGroups.map(({ category, rows }) => {
                                    const categoryCell = <th scope="rowgroup" rowSpan={Math.max(1, rows.length)} className="px-4 py-3 text-left align-top font-medium text-white">
                                        <div>{category}</div>
                                        <button type="button" onClick={() => addSource(category)} aria-label={`${category} 세부항목 추가`} data-capture-exclude className="btn-secondary mt-3 whitespace-nowrap text-xs">+ 세부항목 추가</button>
                                    </th>;
                                    return <tbody key={category} data-source-category={category}>
                                    {rows.length === 0 ? <tr className="border-b border-white/[0.05]">
                                        {categoryCell}
                                        <td colSpan={4} className="px-4 py-4 text-gray-500">세부항목이 없습니다. 추가 버튼으로 등록하세요.</td>
                                    </tr> : rows.map((source, index) => (
                                        <tr key={source.id} className="border-b border-white/[0.05] align-top">
                                            {index === 0 && categoryCell}
                                            <td className="px-3 py-3 text-center text-gray-400">
                                                <div>{index + 1}</div>
                                                <button type="button" onClick={() => removeSource(source)} aria-label={`${category} 세부항목 ${index + 1} 삭제`} data-capture-exclude className="mt-2 text-xs text-rose-300 hover:underline">삭제</button>
                                            </td>
                                            {YEAR_FIELDS.map((field) => {
                                                const year = parseSourceYear(source[field]);
                                                const sourceWidth = Math.max(200, year.source.length * 14 + 32);
                                                return (
                                                    <td key={field} className="p-0">
                                                        <div className="grid divide-x divide-white/[0.05]" style={{ gridTemplateColumns: `minmax(${sourceWidth}px, 1fr) 160px`, minWidth: sourceWidth + 160 }}>
                                                            <input
                                                                type="text"
                                                                aria-label={`${category} 세부항목 ${index + 1} ${YEAR_LABELS[field]} 출처`}
                                                                list={`source-options-${projectId}`}
                                                                value={year.source}
                                                                title={year.source}
                                                                onChange={(event) => updateSourceYear(source.id, field, 'source', event.target.value)}
                                                                className="min-w-0 bg-transparent px-3 py-3 text-white outline-none focus:bg-white/[0.04]"
                                                                placeholder="출처"
                                                            />
                                                            <MoneyInput
                                                                aria-label={`${category} 세부항목 ${index + 1} ${YEAR_LABELS[field]} 금액`}
                                                                value={year.amount}
                                                                onValueChange={(value) => updateSourceYear(source.id, field, 'amount', value == null ? '' : String(value))}
                                                                className="min-w-0 bg-transparent px-3 py-3 text-right text-white outline-none focus:bg-white/[0.04]"
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                    </tbody>;
                                })}
                                <tfoot>
                                    <tr className="bg-white/[0.03] font-semibold text-white">
                                        <td colSpan={2} className="px-4 py-3">자금조달 합계</td>
                                        {YEAR_FIELDS.map((field) => (
                                            <td key={field} className="px-4 py-3 text-right">
                                                {formatMoney(sourceTotals[field])}
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            </table>
                            <datalist id={`source-options-${projectId}`}>
                                {sourceOptions.map((option) => <option key={option} value={option} />)}
                            </datalist>
                        </div>
                    </div>
                </div>
            )}
        </fieldset>
    );
}
