'use client';

import { useState, useEffect, useRef } from 'react';

interface TargetSpecRow {
    id: string;
    category: string;
    subCategory: string;
    specItem: string;
    unit: string;
    currentValue: string;
    competitorValue: string;
    targetValue: string;
    note: string;
    order: number;
}

interface Props { projectId: string; }

export default function TargetSpecTable({ projectId }: Props) {
    const [rows, setRows] = useState<TargetSpecRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (msg: string) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast(msg);
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        fetch(`/api/projects/${projectId}/target-spec`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.rows) {
                    setRows(data.rows.map((r: any) => ({
                        id: r.id, category: r.category ?? '', subCategory: r.subCategory ?? '',
                        specItem: r.specItem ?? '', unit: r.unit ?? '', currentValue: r.currentValue ?? '',
                        competitorValue: r.competitorValue ?? '', targetValue: r.targetValue ?? '',
                        note: r.note ?? '', order: r.order,
                    })));
                }
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, [projectId]);

    const addRow = () => setRows(prev => [...prev, { id: `new_${Date.now()}`, category: '', subCategory: '', specItem: '', unit: '', currentValue: '', competitorValue: '', targetValue: '', note: '', order: prev.length }]);
    const updateRow = (id: string, field: keyof TargetSpecRow, val: string) => setRows(rows.map(r => r.id === id ? { ...r, [field]: val } : r));
    const deleteRow = (id: string) => setRows(rows.filter(r => r.id !== id));

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/target-spec`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows: rows.map((r, idx) => ({ category: r.category, subCategory: r.subCategory, specItem: r.specItem, unit: r.unit, currentValue: r.currentValue, competitorValue: r.competitorValue, targetValue: r.targetValue, note: r.note, order: idx })) }),
            });
            if (res.ok) {
                const data = await res.json();
                setRows(data.rows.map((r: any) => ({ id: r.id, category: r.category ?? '', subCategory: r.subCategory ?? '', specItem: r.specItem ?? '', unit: r.unit ?? '', currentValue: r.currentValue ?? '', competitorValue: r.competitorValue ?? '', targetValue: r.targetValue ?? '', note: r.note ?? '', order: r.order })));
                showToast('저장되었습니다.');
            } else { showToast('저장에 실패했습니다.'); }
        } catch { showToast('저장에 실패했습니다.'); }
        finally { setIsSaving(false); }
    };

    const handleReset = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/target-spec`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: [] }) });
            if (res.ok) { setRows([]); setShowResetConfirm(false); showToast('초기화되었습니다.'); }
        } catch { showToast('초기화에 실패했습니다.'); }
        finally { setIsSaving(false); }
    };

    const inp = (value: string, onChange: (v: string) => void, placeholder: string, colorClass = 'text-white') => (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className={`w-full p-2 bg-transparent ${colorClass} text-xs border-none outline-none focus:ring-1 focus:ring-primary-500/50 placeholder-gray-700`} placeholder={placeholder} />
    );

    if (isLoading) return <div className="flex items-center justify-center p-12"><div className="animate-spin h-7 w-7 border-2 border-primary-500 border-t-transparent rounded-full" /></div>;

    return (
        <div className="space-y-4 relative">
            {toast && (
                <div className="fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border bg-emerald-900/90 border-emerald-500/40 text-emerald-200 animate-fade-in">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span className="text-sm font-medium">{toast}</span>
                </div>
            )}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">목표사양서</h2>
                    <p className="text-sm text-gray-500 mt-1">현재/경쟁사/목표 사양 비교표</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={addRow} className="btn-secondary text-sm flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>행 추가
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="btn-primary text-sm flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                    {rows.length > 0 && (
                        <button onClick={() => setShowResetConfirm(true)} className="px-3 py-2 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>
                    )}
                </div>
            </div>
            {showResetConfirm && (
                <div className="card border-rose-500/25 bg-rose-500/[0.04] animate-fade-in">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-rose-500/15 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <div>
                                <p className="text-white text-sm font-semibold">목표사양서 초기화</p>
                                <p className="text-rose-300/70 text-xs mt-0.5">모든 데이터가 삭제됩니다. 되돌릴 수 없습니다.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowResetConfirm(false)} className="btn-secondary text-sm">취소</button>
                            <button onClick={handleReset} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm rounded-lg transition-colors font-medium">초기화</button>
                        </div>
                    </div>
                </div>
            )}
            <div className="card p-0 overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                    <thead>
                        <tr className="bg-white/[0.04] border-b border-white/[0.08]">
                            <th className="border border-white/[0.06] p-2 text-gray-400 text-center w-[40px]">No</th>
                            <th className="border border-white/[0.06] p-2 text-white font-semibold text-center" colSpan={2}>구분</th>
                            <th className="border border-white/[0.06] p-2 text-white font-semibold text-center min-w-[120px]">사양항목</th>
                            <th className="border border-white/[0.06] p-2 text-gray-300 font-semibold text-center w-[70px]">단위</th>
                            <th className="border border-white/[0.06] p-2 text-blue-300 font-semibold text-center min-w-[90px]">현재사양</th>
                            <th className="border border-white/[0.06] p-2 text-red-300 font-semibold text-center min-w-[90px]">경쟁사사양</th>
                            <th className="border border-white/[0.06] p-2 text-emerald-300 font-semibold text-center min-w-[90px]">목표사양</th>
                            <th className="border border-white/[0.06] p-2 text-gray-400 font-semibold text-center min-w-[100px]">비고</th>
                            <th className="border border-white/[0.06] p-2 w-[40px]" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr><td colSpan={10} className="border border-white/[0.06] p-10 text-center">
                                <p className="text-gray-500 text-sm mb-3">목표사양서를 작성하세요</p>
                                <button onClick={addRow} className="btn-primary text-sm">행 추가하기</button>
                            </td></tr>
                        ) : rows.map((row, idx) => (
                            <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] group">
                                <td className="border border-white/[0.06] p-2 text-center text-gray-600">{idx + 1}</td>
                                <td className="border border-white/[0.06] p-0">{inp(row.category, v => updateRow(row.id, 'category', v), '대분류')}</td>
                                <td className="border border-white/[0.06] p-0">{inp(row.subCategory, v => updateRow(row.id, 'subCategory', v), '소분류')}</td>
                                <td className="border border-white/[0.06] p-0">{inp(row.specItem, v => updateRow(row.id, 'specItem', v), '사양항목명', 'text-white font-semibold')}</td>
                                <td className="border border-white/[0.06] p-0">{inp(row.unit, v => updateRow(row.id, 'unit', v), '단위', 'text-gray-300 text-center')}</td>
                                <td className="border border-white/[0.06] p-0 bg-blue-900/[0.06]">{inp(row.currentValue, v => updateRow(row.id, 'currentValue', v), '현재값', 'text-blue-300 text-center')}</td>
                                <td className="border border-white/[0.06] p-0 bg-red-900/[0.06]">{inp(row.competitorValue, v => updateRow(row.id, 'competitorValue', v), '경쟁사값', 'text-red-300 text-center')}</td>
                                <td className="border border-white/[0.06] p-0 bg-emerald-900/[0.06]">{inp(row.targetValue, v => updateRow(row.id, 'targetValue', v), '목표값', 'text-emerald-300 text-center font-bold')}</td>
                                <td className="border border-white/[0.06] p-0">{inp(row.note, v => updateRow(row.id, 'note', v), '비고', 'text-gray-400')}</td>
                                <td className="border border-white/[0.06] p-2 text-center">
                                    <button onClick={() => deleteRow(row.id)} className="w-6 h-6 rounded flex items-center justify-center text-gray-700 hover:text-rose-400 hover:bg-rose-500/10 transition-colors mx-auto opacity-0 group-hover:opacity-100">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length > 0 && (
                    <div className="p-3 border-t border-white/[0.06] flex items-center justify-between">
                        <button onClick={addRow} className="flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm transition-colors group">
                            <div className="w-6 h-6 rounded border-2 border-dashed border-gray-700 group-hover:border-gray-500 flex items-center justify-center transition-colors">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </div>
                            행 추가
                        </button>
                        <span className="text-xs text-gray-600">{rows.length}개 행</span>
                    </div>
                )}
            </div>
        </div>
    );
}
