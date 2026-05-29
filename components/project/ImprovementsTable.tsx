'use client';

import { useState, useEffect, useRef } from 'react';
import { buildImprovementSuggestionsFromQfd } from '@/lib/worksheet-links';

interface ImprovementRow { id: string; customerNeed: string; improvementRate: string; devProportion: string; order: number; }
interface ImprovementFeature { id: string; feature: string; priority: string; order: number; }
interface Props { projectId: string; }

export default function ImprovementsTable({ projectId }: Props) {
    const [rows, setRows] = useState<ImprovementRow[]>([]);
    const [features, setFeatures] = useState<ImprovementFeature[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [qfdData, setQfdData] = useState<any>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (msg: string) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast(msg);
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        fetch(`/api/projects/${projectId}/improvements`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.items) {
                    const needs = data.items.filter((i: any) => i.type === 'need').map((i: any) => ({
                        id: i.id, customerNeed: i.content ?? '', improvementRate: i.improvementRate ?? '', devProportion: i.devProportion ?? '', order: i.order,
                    }));
                    const feats = data.items.filter((i: any) => i.type === 'feature').map((i: any) => ({
                        id: i.id, feature: i.content ?? '', priority: i.priority ?? '', order: i.order,
                    }));
                    setRows(needs);
                    setFeatures(feats);
                }
                if (data?.qfdAnalysis) {
                    setQfdData(data.qfdAnalysis);
                }
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, [projectId]);

    const addRow = () => setRows(prev => [...prev, { id: `new_${Date.now()}`, customerNeed: '', improvementRate: '', devProportion: '', order: prev.length }]);
    const addFeature = () => setFeatures(prev => [...prev, { id: `newf_${Date.now()}`, feature: '', priority: '', order: prev.length }]);
    const updateRow = (id: string, field: keyof ImprovementRow, val: string) => setRows(rows.map(r => r.id === id ? { ...r, [field]: val } : r));
    const updateFeature = (id: string, field: keyof ImprovementFeature, val: string) => setFeatures(features.map(f => f.id === id ? { ...f, [field]: val } : f));
    const deleteRow = (id: string) => setRows(rows.filter(r => r.id !== id));
    const deleteFeature = (id: string) => setFeatures(features.filter(f => f.id !== id));

    const buildPayload = (r: ImprovementRow[], f: ImprovementFeature[]) => ({
        items: [
            ...r.map((row, idx) => ({ type: 'need', content: row.customerNeed, improvementRate: row.improvementRate, devProportion: row.devProportion, order: idx })),
            ...f.map((feat, idx) => ({ type: 'feature', content: feat.feature, priority: feat.priority, order: idx })),
        ],
    });

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/improvements`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPayload(rows, features)),
            });
            if (res.ok) {
                const data = await res.json();
                setRows(data.items.filter((i: any) => i.type === 'need').map((i: any) => ({ id: i.id, customerNeed: i.content ?? '', improvementRate: i.improvementRate ?? '', devProportion: i.devProportion ?? '', order: i.order })));
                setFeatures(data.items.filter((i: any) => i.type === 'feature').map((i: any) => ({ id: i.id, feature: i.content ?? '', priority: i.priority ?? '', order: i.order })));
                showToast('저장되었습니다.');
            } else { showToast('저장에 실패했습니다.'); }
        } catch { showToast('저장에 실패했습니다.'); }
        finally { setIsSaving(false); }
    };

    const handleReset = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/improvements`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: [] }),
            });
            if (res.ok) { setRows([]); setFeatures([]); setShowResetConfirm(false); showToast('초기화되었습니다.'); }
        } catch { showToast('초기화에 실패했습니다.'); }
        finally { setIsSaving(false); }
    };

    const handleImportFromQFD = () => {
        if (!qfdData?.requirements) {
            showToast('QFD 분석 데이터가 없습니다.');
            return;
        }

        const suggestions = buildImprovementSuggestionsFromQfd(qfdData.requirements);

        setRows(suggestions);
        showToast('QFD 데이터가 연동되었습니다.');
    };

    if (isLoading) return <div className="flex items-center justify-center p-12"><div className="animate-spin h-7 w-7 border-2 border-primary-500 border-t-transparent rounded-full" /></div>;

    const cellInput = (value: string, onChange: (v: string) => void, placeholder: string, colorClass = 'text-white') => (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className={`w-full p-2.5 bg-transparent ${colorClass} text-sm border-none outline-none focus:ring-1 focus:ring-primary-500/50 placeholder-gray-700`} placeholder={placeholder} />
    );

    return (
        <div className="space-y-6 relative">
            {toast && (
                <div className="fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border bg-emerald-900/90 border-emerald-500/40 text-emerald-200 animate-fade-in">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span className="text-sm font-medium">{toast}</span>
                </div>
            )}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">개선포인트도출</h2>
                    <p className="text-sm text-gray-500 mt-1">개선포인트점수 기반 고객니즈 우선순위</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleImportFromQFD} className="btn-secondary text-sm flex items-center gap-1.5 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        QFD 데이터 연동
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="btn-primary text-sm flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                    {(rows.length > 0 || features.length > 0) && (
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
                                <p className="text-white text-sm font-semibold">개선포인트 데이터 초기화</p>
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
            {/* 고객니즈 우선순위 테이블 */}
            <div className="card p-0 overflow-x-auto">
                <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
                    <h3 className="text-base font-semibold text-white">개선포인트점수 기반 고객니즈 우선순위</h3>
                    <button onClick={addRow} className="btn-secondary text-xs flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>행 추가
                    </button>
                </div>
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-white/[0.04]">
                            <th className="border border-white/[0.06] p-3 text-gray-400 text-center w-[50px]">순위</th>
                            <th className="border border-white/[0.06] p-3 text-white font-semibold text-center">고객니즈</th>
                            <th className="border border-white/[0.06] p-3 text-cyan-300 font-semibold text-center min-w-[150px]">경쟁사대비 수준향상율</th>
                            <th className="border border-white/[0.06] p-3 text-emerald-300 font-semibold text-center min-w-[120px]">개발향상비중</th>
                            <th className="border border-white/[0.06] p-3 w-[40px]" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr><td colSpan={5} className="border border-white/[0.06] p-8 text-center">
                                <p className="text-gray-500 text-sm mb-3">데이터가 없습니다</p>
                                <button onClick={addRow} className="btn-primary text-sm">행 추가하기</button>
                            </td></tr>
                        ) : rows.map((row, idx) => (
                            <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] group">
                                <td className="border border-white/[0.06] p-2 text-center text-amber-300 font-bold">{idx + 1}</td>
                                <td className="border border-white/[0.06] p-0">{cellInput(row.customerNeed, v => updateRow(row.id, 'customerNeed', v), '고객 니즈')}</td>
                                <td className="border border-white/[0.06] p-0">{cellInput(row.improvementRate, v => updateRow(row.id, 'improvementRate', v), '예: 1.5', 'text-cyan-300 text-center')}</td>
                                <td className="border border-white/[0.06] p-0">{cellInput(row.devProportion, v => updateRow(row.id, 'devProportion', v), '예: 30%', 'text-emerald-300 text-center')}</td>
                                <td className="border border-white/[0.06] p-2 text-center">
                                    <button onClick={() => deleteRow(row.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-700 hover:text-rose-400 hover:bg-rose-500/10 transition-colors mx-auto opacity-0 group-hover:opacity-100">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length > 0 && (
                    <div className="p-3 border-t border-white/[0.06]">
                        <button onClick={addRow} className="flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm transition-colors group">
                            <div className="w-6 h-6 rounded border-2 border-dashed border-gray-700 group-hover:border-gray-500 flex items-center justify-center transition-colors">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </div>
                            행 추가
                        </button>
                    </div>
                )}
            </div>
            {/* 개선 기능/성능 리스트 */}
            <div className="card p-0 overflow-x-auto">
                <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
                    <h3 className="text-base font-semibold text-white">개선포인트기반 개선 기능/성능 List</h3>
                    <button onClick={addFeature} className="btn-secondary text-xs flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>항목 추가
                    </button>
                </div>
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-white/[0.04]">
                            <th className="border border-white/[0.06] p-3 text-gray-400 text-center w-[50px]">순위</th>
                            <th className="border border-white/[0.06] p-3 text-white font-semibold text-center">개선 기능/성능</th>
                            <th className="border border-white/[0.06] p-3 text-amber-300 font-semibold text-center w-[120px]">우선순위</th>
                            <th className="border border-white/[0.06] p-3 w-[40px]" />
                        </tr>
                    </thead>
                    <tbody>
                        {features.length === 0 ? (
                            <tr><td colSpan={4} className="border border-white/[0.06] p-8 text-center">
                                <p className="text-gray-500 text-sm mb-3">개선 기능/성능이 없습니다</p>
                                <button onClick={addFeature} className="btn-primary text-sm">항목 추가하기</button>
                            </td></tr>
                        ) : features.map((f, idx) => (
                            <tr key={f.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] group">
                                <td className="border border-white/[0.06] p-2 text-center text-amber-300 font-bold">{idx + 1}</td>
                                <td className="border border-white/[0.06] p-0">{cellInput(f.feature, v => updateFeature(f.id, 'feature', v), '개선할 기능 또는 성능')}</td>
                                <td className="border border-white/[0.06] p-0">{cellInput(f.priority, v => updateFeature(f.id, 'priority', v), '상/중/하', 'text-amber-300 text-center')}</td>
                                <td className="border border-white/[0.06] p-2 text-center">
                                    <button onClick={() => deleteFeature(f.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-700 hover:text-rose-400 hover:bg-rose-500/10 transition-colors mx-auto opacity-0 group-hover:opacity-100">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {features.length > 0 && (
                    <div className="p-3 border-t border-white/[0.06]">
                        <button onClick={addFeature} className="flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm transition-colors group">
                            <div className="w-6 h-6 rounded border-2 border-dashed border-gray-700 group-hover:border-gray-500 flex items-center justify-center transition-colors">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </div>
                            항목 추가
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
