'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface SpecFunction {
    id: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string;
    name: string;
    technology?: string;
}

interface Requirement {
    id: string;
    category: string;
    requirement: string;
}

interface TechTreeRow {
    id: string;
    customerVoice: string;
    coreSpec: string;
    subSpec: string;
    techCharacteristic: string;
}

export default function TechTreePage() {
    const params = useParams();
    const projectId = params.id as string;
    const [rows, setRows] = useState<TechTreeRow[]>([]);
    const [specs, setSpecs] = useState<SpecFunction[]>([]);
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ message, type });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    const loadData = useCallback(async () => {
        try {
            const [specRes, reqRes] = await Promise.all([
                fetch(`/api/projects/${projectId}/spec`),
                fetch(`/api/projects/${projectId}/requirements`),
            ]);
            if (specRes.ok) { const d = await specRes.json(); setSpecs(d.specFunctions || []); }
            if (reqRes.ok) { const d = await reqRes.json(); setRequirements(d.requirements || []); }
            const saved = localStorage.getItem(`techTree_${projectId}`);
            if (saved) { setRows(JSON.parse(saved)); }
        } catch (e) { console.error(e); }
        finally { setIsLoading(false); }
    }, [projectId]);

    useEffect(() => { loadData(); }, [loadData]);

    const save = (data: TechTreeRow[]) => {
        localStorage.setItem(`techTree_${projectId}`, JSON.stringify(data));
    };

    const handleSave = () => {
        save(rows);
        showToast('기능기술체계도가 저장되었습니다.', 'success');
    };

    const autoGenerate = () => {
        const generated: TechTreeRow[] = [];
        const coreSpecs = specs.filter(s => s.level === 'CORE');
        requirements.forEach((req, rIdx) => {
            coreSpecs.forEach((core, cIdx) => {
                const subs = specs.filter(s => s.level === 'SUB' && s.parentId === core.id);
                if (subs.length === 0) {
                    generated.push({ id: `tt_${Date.now()}_${rIdx}_${cIdx}`, customerVoice: req.requirement, coreSpec: core.name, subSpec: '', techCharacteristic: core.technology || '' });
                } else {
                    subs.forEach((sub, sIdx) => {
                        generated.push({ id: `tt_${Date.now()}_${rIdx}_${cIdx}_${sIdx}`, customerVoice: sIdx === 0 && cIdx === 0 ? req.requirement : '', coreSpec: sIdx === 0 ? core.name : '', subSpec: sub.name, techCharacteristic: sub.technology || '' });
                    });
                }
            });
        });
        if (generated.length === 0) {
            coreSpecs.forEach(core => {
                const subs = specs.filter(s => s.level === 'SUB' && s.parentId === core.id);
                if (subs.length === 0) {
                    generated.push({ id: `tt_${Date.now()}_${core.id}`, customerVoice: '', coreSpec: core.name, subSpec: '', techCharacteristic: core.technology || '' });
                } else {
                    subs.forEach((sub, i) => {
                        generated.push({ id: `tt_${Date.now()}_${core.id}_${sub.id}`, customerVoice: '', coreSpec: i === 0 ? core.name : '', subSpec: sub.name, techCharacteristic: sub.technology || '' });
                    });
                }
            });
        }
        setRows(generated);
        showToast(`${generated.length}개 행이 자동 생성되었습니다.`, 'info');
    };

    const addRow = () => setRows(prev => [...prev, { id: `tt_${Date.now()}`, customerVoice: '', coreSpec: '', subSpec: '', techCharacteristic: '' }]);
    const updateRow = (id: string, field: keyof TechTreeRow, value: string) => setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
    const deleteRow = (id: string) => setRows(rows.filter(r => r.id !== id));

    const handleReset = () => {
        setRows([]);
        localStorage.removeItem(`techTree_${projectId}`);
        setShowResetConfirm(false);
        showToast('기능기술체계도가 초기화되었습니다.', 'success');
    };

    if (isLoading) return (
        <div className="min-h-screen bg-surface-900 flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full" />
        </div>
    );

    const hasRows = rows.length > 0;
    const canAutoGenerate = specs.length > 0 || requirements.length > 0;

    return (
        <div className="min-h-screen bg-surface-900 bg-grid">
            {/* 토스트 */}
            {toast && (
                <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border animate-fade-in ${toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200'
                        : toast.type === 'error' ? 'bg-red-900/90 border-red-500/40 text-red-200'
                            : 'bg-blue-900/90 border-blue-500/40 text-blue-200'
                    }`}>
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={toast.type === 'success' ? 'M5 13l4 4L19 7' : toast.type === 'error' ? 'M6 18L18 6M6 6l12 12' : 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'} />
                    </svg>
                    <span className="text-sm font-medium">{toast.message}</span>
                </div>
            )}

            {/* 글래스 헤더 */}
            <header className="glass-border sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href={`/project/${projectId}`} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                프로젝트
                            </Link>
                            <div className="h-4 w-px bg-white/[0.10]" />
                            <div>
                                <h1 className="text-lg font-display font-bold text-white flex items-center gap-2">
                                    <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                                    </svg>
                                    기능기술체계도
                                </h1>
                                <p className="text-xs text-gray-500 mt-0.5">고객의 소리와 기술특성 연결</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {canAutoGenerate && (
                                <button onClick={autoGenerate} className="btn-secondary text-sm flex items-center gap-1.5">
                                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    자동 생성
                                </button>
                            )}
                            <button onClick={addRow} className="btn-secondary text-sm flex items-center gap-1.5">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                행 추가
                            </button>
                            <button onClick={handleSave} className="btn-primary text-sm flex items-center gap-1.5" disabled={!hasRows}>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                </svg>
                                저장
                            </button>
                            {hasRows && (
                                <button onClick={() => setShowResetConfirm(true)} className="px-3 py-2 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                {/* 리셋 확인 배너 */}
                {showResetConfirm && (
                    <div className="card border-rose-500/25 bg-rose-500/[0.04] animate-fade-in">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-rose-500/15 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                </div>
                                <div>
                                    <p className="text-white text-sm font-semibold">기능기술체계도 초기화</p>
                                    <p className="text-rose-300/70 text-xs mt-0.5">모든 행이 삭제됩니다. 되돌릴 수 없습니다.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setShowResetConfirm(false)} className="btn-secondary text-sm">취소</button>
                                <button onClick={handleReset} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm rounded-lg transition-colors font-medium">초기화</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 빈 상태 */}
                {!hasRows ? (
                    <div className="card text-center py-16">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                            <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-display font-semibold text-white mb-2">기능기술체계도를 작성하세요</h3>
                        <p className="text-gray-500 text-sm mb-6">고객의 소리와 제품 기능 스펙, 기술특성을 연결합니다</p>
                        <div className="flex items-center justify-center gap-3 flex-wrap">
                            {canAutoGenerate && (
                                <button onClick={autoGenerate} className="btn-primary flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    스펙에서 자동 생성
                                </button>
                            )}
                            <button onClick={addRow} className="btn-secondary flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                직접 입력
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="card p-0 overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-white/[0.04] border-b border-white/[0.08]">
                                    <th className="border border-white/[0.06] p-3 text-white font-semibold text-center min-w-[200px]">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full bg-amber-400" />
                                            고객의 소리
                                        </div>
                                    </th>
                                    <th className="border border-white/[0.06] p-3 text-white font-semibold text-center min-w-[150px]">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full bg-blue-400" />
                                            핵심스펙(기능)
                                        </div>
                                    </th>
                                    <th className="border border-white/[0.06] p-3 text-white font-semibold text-center min-w-[150px]">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full bg-purple-400" />
                                            세부스펙(기능)
                                        </div>
                                    </th>
                                    <th className="border border-white/[0.06] p-3 text-cyan-300 font-semibold text-center min-w-[200px]">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full bg-cyan-400" />
                                            기술적 특성
                                        </div>
                                    </th>
                                    <th className="border border-white/[0.06] p-3 text-center w-[50px]">
                                        <svg className="w-4 h-4 text-gray-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, idx) => (
                                    <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group">
                                        <td className="border border-white/[0.06] p-0">
                                            <textarea value={row.customerVoice} onChange={e => updateRow(row.id, 'customerVoice', e.target.value)}
                                                className="w-full p-2.5 bg-transparent text-white text-sm border-none focus:ring-1 focus:ring-amber-500/50 resize-none placeholder-gray-700 outline-none"
                                                placeholder="고객 요구사항" rows={2} />
                                        </td>
                                        <td className="border border-white/[0.06] p-0">
                                            <input type="text" value={row.coreSpec} onChange={e => updateRow(row.id, 'coreSpec', e.target.value)}
                                                className="w-full p-2.5 bg-transparent text-white text-sm font-medium border-none focus:ring-1 focus:ring-blue-500/50 placeholder-gray-700 outline-none"
                                                placeholder="핵심 기능" />
                                        </td>
                                        <td className="border border-white/[0.06] p-0">
                                            <input type="text" value={row.subSpec} onChange={e => updateRow(row.id, 'subSpec', e.target.value)}
                                                className="w-full p-2.5 bg-transparent text-white text-sm border-none focus:ring-1 focus:ring-purple-500/50 placeholder-gray-700 outline-none"
                                                placeholder="세부 기능" />
                                        </td>
                                        <td className="border border-white/[0.06] p-0 bg-cyan-900/[0.06]">
                                            <input type="text" value={row.techCharacteristic} onChange={e => updateRow(row.id, 'techCharacteristic', e.target.value)}
                                                className="w-full p-2.5 bg-transparent text-cyan-300 text-sm border-none focus:ring-1 focus:ring-cyan-500/50 placeholder-gray-700 outline-none"
                                                placeholder="기술적 특성" />
                                        </td>
                                        <td className="border border-white/[0.06] p-2 text-center">
                                            <button onClick={() => deleteRow(row.id)}
                                                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-700 hover:text-rose-400 hover:bg-rose-500/10 transition-colors mx-auto opacity-0 group-hover:opacity-100">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* 빠른 행 추가 */}
                        <div className="p-3 border-t border-white/[0.06] flex items-center justify-between">
                            <button onClick={addRow} className="flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm transition-colors group">
                                <div className="w-6 h-6 rounded border-2 border-dashed border-gray-700 group-hover:border-gray-500 flex items-center justify-center transition-colors">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                </div>
                                행 추가
                            </button>
                            <span className="text-xs text-gray-600">{rows.length}개 행</span>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
