'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type SalesPeriod = 'Y' | 'Y_PLUS_1';

interface SalesRow {
    id: string;
    period: SalesPeriod;
    customer: string;
    amount: number;
    competitor: string;
    order: number;
}

interface Props {
    projectId: string;
    onSaved?: () => void;
}

const PERIODS: Array<{ key: SalesPeriod; title: string; description: string; accent: string; focus: string }> = [
    {
        key: 'Y',
        title: '현재(Y) 매출',
        description: '현재 기준 매출처별 매출 현황',
        accent: 'text-amber-300',
        focus: 'focus:ring-amber-500/50',
    },
    {
        key: 'Y_PLUS_1',
        title: '미래(Y+1차) 매출',
        description: '1년 후 목표 매출처별 매출 추정',
        accent: 'text-emerald-300',
        focus: 'focus:ring-emerald-500/50',
    },
];

function createRow(period: SalesPeriod, order = 0): SalesRow {
    return {
        id: `new_${period}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        period,
        customer: '',
        amount: 0,
        competitor: '',
        order,
    };
}

function formatAmount(value: number) {
    return Number(value || 0).toLocaleString('ko-KR');
}

function parseAmount(value: string) {
    return Number(value.replace(/,/g, '')) || 0;
}

export default function SalesTable({ projectId, onSaved }: Props) {
    const [rows, setRows] = useState<SalesRow[]>([createRow('Y'), createRow('Y_PLUS_1')]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const rowsByPeriod = useMemo(() => {
        const grouped: Record<SalesPeriod, SalesRow[]> = { Y: [], Y_PLUS_1: [] };
        for (const row of rows) {
            grouped[row.period].push(row);
        }
        return {
            Y: grouped.Y.length > 0 ? grouped.Y : [createRow('Y')],
            Y_PLUS_1: grouped.Y_PLUS_1.length > 0 ? grouped.Y_PLUS_1 : [createRow('Y_PLUS_1')],
        };
    }, [rows]);

    const showToast = (msg: string) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast(msg);
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        fetch(`/api/projects/${projectId}/sales`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data?.rows && data.rows.length > 0) {
                    const loadedRows: SalesRow[] = [];
                    for (const r of data.rows) {
                        const period: SalesPeriod = r.period === 'Y_PLUS_1' ? 'Y_PLUS_1' : 'Y';
                        loadedRows.push({
                            id: r.id,
                            period,
                            customer: r.customer ?? '',
                            amount: Number(r.amount) || 0,
                            competitor: r.competitor ?? '',
                            order: r.order,
                        });

                        // 이전 구현에서 한 행에 들어간 Y+1 값이 있으면 새 독립 행으로 표시합니다.
                        if (period === 'Y' && Number(r.futureAmount) > 0) {
                            loadedRows.push({
                                id: `${r.id}_future`,
                                period: 'Y_PLUS_1',
                                customer: r.customer ?? '',
                                amount: Number(r.futureAmount) || 0,
                                competitor: r.competitor ?? '',
                                order: loadedRows.length,
                            });
                        }
                    }
                    const hasY = loadedRows.some((row) => row.period === 'Y');
                    const hasFuture = loadedRows.some((row) => row.period === 'Y_PLUS_1');
                    setRows([
                        ...loadedRows,
                        ...(hasY ? [] : [createRow('Y')]),
                        ...(hasFuture ? [] : [createRow('Y_PLUS_1')]),
                    ]);
                } else {
                    setRows([createRow('Y'), createRow('Y_PLUS_1')]);
                }
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, [projectId]);

    const addRow = (period: SalesPeriod) => {
        setRows((current) => {
            const periodRows = current.filter((row) => row.period === period);
            return [...current, createRow(period, periodRows.length)];
        });
    };

    const updateRow = (id: string, field: keyof SalesRow, value: string | number) => {
        setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    };

    const deleteRow = (id: string) => {
        setRows((current) => {
            const target = current.find((row) => row.id === id);
            const filtered = current.filter((row) => row.id !== id);
            if (!target) return filtered;
            const remainingForPeriod = filtered.filter((row) => row.period === target.period);
            return remainingForPeriod.length > 0 ? filtered : [...filtered, createRow(target.period)];
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload = PERIODS.flatMap(({ key }) => rowsByPeriod[key].map((row, idx) => ({
                period: key,
                customer: row.customer,
                amount: row.amount,
                competitor: row.competitor,
                order: idx,
            })));

            const res = await fetch(`/api/projects/${projectId}/sales`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows: payload }),
            });

            if (res.ok) {
                const data = await res.json();
                setRows(data.rows.map((r: any) => ({
                    id: r.id,
                    period: r.period === 'Y_PLUS_1' ? 'Y_PLUS_1' : 'Y',
                    customer: r.customer ?? '',
                    amount: Number(r.amount) || 0,
                    competitor: r.competitor ?? '',
                    order: r.order,
                })));
                showToast('저장되었습니다. 다음 워크시트로 이동합니다.');
                setTimeout(() => onSaved?.(), 1000);
            } else {
                showToast('저장에 실패했습니다.');
            }
        } catch {
            showToast('저장에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/sales`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows: [] }),
            });
            if (res.ok) {
                setRows([createRow('Y'), createRow('Y_PLUS_1')]);
                setShowResetConfirm(false);
                showToast('초기화되었습니다.');
            }
        } catch {
            showToast('초기화에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="relative space-y-5">
            {toast && (
                <div className="fixed right-6 top-6 z-[100] flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-900/90 px-5 py-3 text-emerald-200 shadow-2xl animate-fade-in">
                    <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium">{toast}</span>
                </div>
            )}

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">자사매출추정표</h2>
                    <p className="mt-1 text-sm text-gray-500">현재(Y)와 미래(Y+1차) 매출표를 각각 독립적으로 작성합니다. (단위: 백만원)</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleSave} disabled={isSaving} className="btn-primary flex items-center gap-1.5 text-sm">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                    <button onClick={() => setShowResetConfirm(true)} className="rounded-lg px-3 py-2 text-sm text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>

            {showResetConfirm && (
                <div className="card border-rose-500/25 bg-rose-500/[0.04] animate-fade-in">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-semibold text-white">매출 데이터 초기화</p>
                            <p className="mt-0.5 text-xs text-rose-300/70">Y와 Y+1차 매출 데이터가 모두 삭제됩니다. 되돌릴 수 없습니다.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowResetConfirm(false)} className="btn-secondary text-sm">취소</button>
                            <button onClick={handleReset} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-500">초기화</button>
                        </div>
                    </div>
                </div>
            )}

            {PERIODS.map((period) => {
                const periodRows = rowsByPeriod[period.key];
                const totalAmount = periodRows.reduce((sum, row) => sum + (row.amount || 0), 0);

                return (
                    <section key={period.key} className="card overflow-x-auto p-0">
                        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                            <div>
                                <h3 className={`text-base font-semibold ${period.accent}`}>{period.title}</h3>
                                <p className="mt-0.5 text-xs text-gray-500">{period.description}</p>
                            </div>
                            <button onClick={() => addRow(period.key)} className="btn-secondary px-3 py-2 text-xs">행 추가</button>
                        </div>

                        <table className="w-full min-w-[760px] border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-white/[0.08] bg-white/[0.04]">
                                    <th className="w-[50px] border border-white/[0.06] p-3 text-center text-gray-400">No.</th>
                                    <th className="border border-white/[0.06] p-3 text-center font-semibold text-white">매출처</th>
                                    <th className={`w-[180px] border border-white/[0.06] p-3 text-center font-semibold ${period.accent}`}>매출액</th>
                                    <th className="border border-white/[0.06] p-3 text-center font-semibold text-white">경쟁사명</th>
                                    <th className="w-[40px] border border-white/[0.06] p-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {periodRows.map((row, idx) => (
                                    <tr key={row.id} className="group border-b border-white/[0.04] hover:bg-white/[0.02]">
                                        <td className="border border-white/[0.06] p-2 text-center text-sm text-gray-600">{idx + 1}</td>
                                        <td className="border border-white/[0.06] p-0">
                                            <input type="text" value={row.customer} onChange={(e) => updateRow(row.id, 'customer', e.target.value)} className="w-full border-none bg-transparent p-2.5 text-sm text-white outline-none placeholder-gray-700 focus:ring-1 focus:ring-primary-500/50" placeholder="매출처명" />
                                        </td>
                                        <td className="border border-white/[0.06] p-0">
                                            <input type="text" inputMode="numeric" value={row.amount ? formatAmount(row.amount) : ''} onChange={(e) => updateRow(row.id, 'amount', parseAmount(e.target.value))} className={`w-full border-none bg-transparent p-2.5 text-right font-mono text-sm ${period.accent} outline-none placeholder-gray-700 focus:ring-1 ${period.focus}`} placeholder="0" />
                                        </td>
                                        <td className="border border-white/[0.06] p-0">
                                            <input type="text" value={row.competitor} onChange={(e) => updateRow(row.id, 'competitor', e.target.value)} className="w-full border-none bg-transparent p-2.5 text-sm text-white outline-none placeholder-gray-700 focus:ring-1 focus:ring-primary-500/50" placeholder="경쟁사명" />
                                        </td>
                                        <td className="border border-white/[0.06] p-2 text-center">
                                            <button onClick={() => deleteRow(row.id)} className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-700 opacity-0 transition-colors hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100">
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-white/[0.03]">
                                    <td colSpan={2} className="border border-white/[0.06] p-3 text-right text-sm font-bold text-white">합계</td>
                                    <td className={`border border-white/[0.06] p-3 text-right font-mono font-bold ${period.accent}`}>{formatAmount(totalAmount)}</td>
                                    <td colSpan={2} className="border border-white/[0.06]" />
                                </tr>
                            </tbody>
                        </table>
                    </section>
                );
            })}
        </div>
    );
}
