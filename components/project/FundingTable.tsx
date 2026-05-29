'use client';

import { useEffect, useState } from 'react';

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

    useEffect(() => {
        loadData();
    }, [projectId]);

    const loadData = async () => {
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
    };

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

    const updatePlan = (id: string, field: keyof FundingPlan, value: number) => {
        setPlans(plans.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    };

    const updateSourceYear = (
        id: string,
        field: 'year1' | 'year2' | 'year3',
        part: keyof FundingSourceYear,
        value: string
    ) => {
        setSources(sources.map((source) => {
            if (source.id !== id) return source;
            const year = parseYear(source[field]);
            return { ...source, [field]: encodeYear({ ...year, [part]: value }) };
        }));
    };

    const sourceTotal = (field: 'year1' | 'year2' | 'year3') =>
        sources.reduce((sum, source) => sum + (Number(parseYear(source[field]).amount) || 0), 0);

    if (isLoading) return <div className="p-8 text-center text-gray-400">로딩 중...</div>;

    return (
        <div className="space-y-12">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">자금소요 및 조달계획</h2>
                <button onClick={handleSave} disabled={isSaving} className="btn-primary">
                    {isSaving ? '저장 중...' : '저장'}
                </button>
            </div>

            <div className="card">
                <h3 className="text-lg font-semibold text-blue-400 mb-4">자금소요계획표(3년간) <span className="text-xs text-gray-500">(단위: 백만원)</span></h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center border-collapse">
                        <thead>
                            <tr className="border-b border-white/10 text-gray-400">
                                <th className="px-4 py-2 text-left">구분</th>
                                <th className="px-4 py-2 text-left">항목</th>
                                <th className="px-4 py-2">Y+1년차</th>
                                <th className="px-4 py-2">Y+2년차</th>
                                <th className="px-4 py-2">Y+3년차</th>
                            </tr>
                        </thead>
                        <tbody>
                            {plans.map((p, index) => (
                                <tr key={p.id} className="border-b border-white/5">
                                    <td className="px-4 py-2 text-left text-gray-400">{index === 0 || plans[index - 1]?.category !== p.category ? p.category : ''}</td>
                                    <td className="px-4 py-2 text-left text-white">{p.item}</td>
                                    {(['year1', 'year2', 'year3'] as const).map((field) => (
                                        <td key={field} className="p-0">
                                            <input
                                                type="number"
                                                value={p[field] || ''}
                                                onChange={(e) => updatePlan(p.id, field, Number(e.target.value) || 0)}
                                                className="w-full bg-transparent px-4 py-2 text-right text-white outline-none focus:bg-white/5"
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

            <div className="card">
                <h3 className="text-lg font-semibold text-emerald-400 mb-4">자금조달계획표(3년간) <span className="text-xs text-gray-500">(단위: 백만원)</span></h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center border-collapse">
                        <thead>
                            <tr className="border-b border-white/10 text-gray-400">
                                <th className="px-4 py-2 text-left" rowSpan={2}>구분</th>
                                <th className="px-4 py-2" colSpan={2}>Y+1년차</th>
                                <th className="px-4 py-2" colSpan={2}>Y+2년차</th>
                                <th className="px-4 py-2" colSpan={2}>Y+3년차</th>
                            </tr>
                            <tr className="border-b border-white/10 text-gray-500">
                                <th className="px-4 py-2">출처</th>
                                <th className="px-4 py-2">금액</th>
                                <th className="px-4 py-2">출처</th>
                                <th className="px-4 py-2">금액</th>
                                <th className="px-4 py-2">출처</th>
                                <th className="px-4 py-2">금액</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sources.map((s) => (
                                <tr key={s.id} className="border-b border-white/5">
                                    <td className="px-4 py-2 text-left text-white font-medium">{s.category}</td>
                                    {(['year1', 'year2', 'year3'] as const).flatMap((field) => {
                                        const year = parseYear(s[field]);
                                        return [
                                            <td key={`${field}-source`} className="p-0">
                                                <input
                                                    type="text"
                                                    value={year.source}
                                                    onChange={(e) => updateSourceYear(s.id, field, 'source', e.target.value)}
                                                    className="w-full bg-transparent px-4 py-2 text-white outline-none focus:bg-white/5"
                                                    placeholder="출처"
                                                />
                                            </td>,
                                            <td key={`${field}-amount`} className="p-0">
                                                <input
                                                    type="number"
                                                    value={year.amount}
                                                    onChange={(e) => updateSourceYear(s.id, field, 'amount', e.target.value)}
                                                    className="w-full bg-transparent px-4 py-2 text-right text-white outline-none focus:bg-white/5"
                                                    placeholder="0"
                                                />
                                            </td>,
                                        ];
                                    })}
                                </tr>
                            ))}
                            <tr className="bg-white/[0.03] text-white font-semibold">
                                <td className="px-4 py-2 text-left">합계</td>
                                <td />
                                <td className="px-4 py-2 text-right">{sourceTotal('year1').toLocaleString()}</td>
                                <td />
                                <td className="px-4 py-2 text-right">{sourceTotal('year2').toLocaleString()}</td>
                                <td />
                                <td className="px-4 py-2 text-right">{sourceTotal('year3').toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
