'use client';

import { useCallback, useEffect, useState } from 'react';

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

const formatFundingLabel = (value: string) => FUNDING_LABELS[value] ?? value;

const parseYear = (value?: string): FundingSourceYear => {
    if (!value) return { source: '', amount: '' };

    try {
        const parsed = JSON.parse(value) as Partial<FundingSourceYear>;
        return { source: parsed.source ?? '', amount: parsed.amount ?? '' };
    } catch {
        const [source = '', amount = ''] = value.split(':');
        return { source, amount };
    }
};

const encodeYear = (value: FundingSourceYear) => JSON.stringify(value);

export default function FundingTable({ projectId }: FundingTableProps) {
    const [plans, setPlans] = useState<FundingPlan[]>([]);
    const [sources, setSources] = useState<FundingSource[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/funding`);
            if (res.ok) {
                const data = await res.json();
                setPlans(data.plans || []);
                setSources(data.sources || []);
            }
        } catch (error) {
            console.error('Failed to load funding data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/funding`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plans, sources }),
            });
            if (res.ok) {
                alert('저장되었습니다.');
                loadData();
            }
        } catch (error) {
            console.error('Failed to save funding data:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const updatePlan = (id: string, field: YearField, value: number) => {
        setPlans(plans.map((plan) => (plan.id === id ? { ...plan, [field]: value } : plan)));
    };

    const updateSourceYear = (
        id: string,
        field: YearField,
        part: keyof FundingSourceYear,
        value: string
    ) => {
        setSources(sources.map((source) => {
            if (source.id !== id) return source;
            const year = parseYear(source[field]);
            return { ...source, [field]: encodeYear({ ...year, [part]: value }) };
        }));
    };

    const planTotal = (field: YearField) =>
        plans.reduce((sum, plan) => sum + (Number(plan[field]) || 0), 0);

    const sourceTotal = (field: YearField) =>
        sources.reduce((sum, source) => sum + (Number(parseYear(source[field]).amount) || 0), 0);

    if (isLoading) {
        return <div className="p-8 text-center text-gray-400">로딩 중...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">자금소요 및 조달계획표</h2>
                <button onClick={handleSave} disabled={isSaving} className="btn-primary">
                    {isSaving ? '저장 중...' : '저장'}
                </button>
            </div>

            <div className="card">
                <div className="mb-4 flex items-end justify-between gap-4">
                    <h3 className="text-lg font-semibold text-blue-400">자금계획 통합표</h3>
                    <span className="text-xs text-gray-500">단위: 백만원</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-white/10 text-center text-gray-400">
                                <th className="w-[120px] px-4 py-3 text-left">구분</th>
                                <th className="w-[220px] px-4 py-3 text-left">항목</th>
                                {YEAR_FIELDS.map((field) => (
                                    <th key={field} className="px-4 py-3">{YEAR_LABELS[field]}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="bg-blue-500/10 text-blue-200">
                                <td colSpan={5} className="px-4 py-2 font-semibold">자금소요계획</td>
                            </tr>
                            {plans.map((plan, index) => (
                                <tr key={plan.id} className="border-b border-white/5">
                                    <td className="px-4 py-2 text-left text-gray-400">
                                        {index === 0 || plans[index - 1]?.category !== plan.category
                                            ? formatFundingLabel(plan.category)
                                            : ''}
                                    </td>
                                    <td className="px-4 py-2 text-left text-white">{formatFundingLabel(plan.item)}</td>
                                    {YEAR_FIELDS.map((field) => (
                                        <td key={field} className="p-0">
                                            <input
                                                type="number"
                                                value={plan[field] || ''}
                                                onChange={(e) => updatePlan(plan.id, field, Number(e.target.value) || 0)}
                                                className="w-full bg-transparent px-4 py-2 text-right text-white outline-none focus:bg-white/5"
                                                placeholder="0"
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            <tr className="border-b border-white/10 bg-white/[0.03] font-semibold text-white">
                                <td className="px-4 py-2 text-left" colSpan={2}>자금소요 합계</td>
                                {YEAR_FIELDS.map((field) => (
                                    <td key={field} className="px-4 py-2 text-right">
                                        {planTotal(field).toLocaleString()}
                                    </td>
                                ))}
                            </tr>

                            <tr className="bg-emerald-500/10 text-emerald-200">
                                <td colSpan={5} className="px-4 py-2 font-semibold">자금조달계획</td>
                            </tr>
                            {sources.map((source) => (
                                <tr key={source.id} className="border-b border-white/5 align-top">
                                    <td className="px-4 py-2 text-left text-emerald-200">조달</td>
                                    <td className="px-4 py-2 text-left font-medium text-white">
                                        {formatFundingLabel(source.category)}
                                    </td>
                                    {YEAR_FIELDS.map((field) => {
                                        const year = parseYear(source[field]);
                                        return (
                                            <td key={field} className="p-0">
                                                <div className="grid grid-cols-[minmax(120px,1fr)_110px] divide-x divide-white/5">
                                                    <input
                                                        type="text"
                                                        value={year.source}
                                                        onChange={(e) => updateSourceYear(source.id, field, 'source', e.target.value)}
                                                        className="min-w-0 bg-transparent px-3 py-2 text-white outline-none focus:bg-white/5"
                                                        placeholder="출처"
                                                    />
                                                    <input
                                                        type="number"
                                                        value={year.amount}
                                                        onChange={(e) => updateSourceYear(source.id, field, 'amount', e.target.value)}
                                                        className="min-w-0 bg-transparent px-3 py-2 text-right text-white outline-none focus:bg-white/5"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            <tr className="bg-white/[0.03] font-semibold text-white">
                                <td className="px-4 py-2 text-left" colSpan={2}>자금조달 합계</td>
                                {YEAR_FIELDS.map((field) => (
                                    <td key={field} className="px-4 py-2 text-right">
                                        {sourceTotal(field).toLocaleString()}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
