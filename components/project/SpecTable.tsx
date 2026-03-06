'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SpecFunction {
    id: string;
    projectId?: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string;
    name: string;
    technology?: string;
    order: number;
}

interface ProjectData {
    id: string;
    name: string;
    description?: string;
}

interface SpecTableProps {
    projectId: string;
}

interface FlatSpecRow {
    id: string;
    core: string;
    sub: string;
    detail: string;
    technology: string;
}

export default function SpecTable({ projectId }: SpecTableProps) {
    const router = useRouter();
    const [project, setProject] = useState<ProjectData | null>(null);
    const [rows, setRows] = useState<FlatSpecRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [activeMode, setActiveMode] = useState<'manual' | 'auto'>('manual');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ message, type });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    // 데이터 로드
    useEffect(() => {
        async function loadData() {
            try {
                const [projRes, specRes] = await Promise.all([
                    fetch('/api/projects'),
                    fetch(`/api/projects/${projectId}/spec`),
                ]);

                if (projRes.ok) {
                    const projData = await projRes.json();
                    const found = projData.projects?.find((p: any) => p.id === projectId);
                    if (found) setProject(found);
                }

                if (specRes.ok) {
                    const specData = await specRes.json();
                    const loadedSpecs: SpecFunction[] = specData.specFunctions || [];
                    const newRows: FlatSpecRow[] = [];
                    const sortedCores = loadedSpecs.filter(s => s.level === 'CORE').sort((a, b) => a.order - b.order);
                    for (const core of sortedCores) {
                        const subs = loadedSpecs.filter(s => s.parentId === core.id && s.level === 'SUB').sort((a, b) => a.order - b.order);
                        if (subs.length === 0) {
                            newRows.push({ id: Math.random().toString(36).slice(2), core: core.name, sub: '', detail: '', technology: '' });
                            continue;
                        }
                        for (const sub of subs) {
                            const details = loadedSpecs.filter(s => s.parentId === sub.id && s.level === 'DETAIL').sort((a, b) => a.order - b.order);
                            if (details.length === 0) {
                                newRows.push({ id: Math.random().toString(36).slice(2), core: core.name, sub: sub.name, detail: '', technology: '' });
                                continue;
                            }
                            for (const detail of details) {
                                newRows.push({ id: Math.random().toString(36).slice(2), core: core.name, sub: sub.name, detail: detail.name, technology: detail.technology || '' });
                            }
                        }
                    }
                    if (newRows.length === 0) {
                        newRows.push({ id: Math.random().toString(36).slice(2), core: '', sub: '', detail: '', technology: '' });
                    }
                    setRows(newRows);
                }
            } catch (error) {
                console.error('데이터 로딩 실패:', error);
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, [projectId]);

    const addRow = () => {
        setRows([...rows, { id: Math.random().toString(36).slice(2), core: '', sub: '', detail: '', technology: '' }]);
    };

    const updateRow = (id: string, field: keyof FlatSpecRow, value: string) => {
        setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const deleteRow = (id: string) => {
        setRows(rows.filter(r => r.id !== id));
    };


    const handleAutoGenerate = async () => {
        setIsGenerating(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/spec/generate`, {
                method: 'POST',
            });
            if (res.ok) {
                const data = await res.json();
                const loadedSpecs: SpecFunction[] = data.specFunctions || [];
                const newRows: FlatSpecRow[] = [];
                const sortedCores = loadedSpecs.filter(s => s.level === 'CORE').sort((a, b) => a.order - b.order);
                for (const core of sortedCores) {
                    const subs = loadedSpecs.filter(s => s.parentId === core.id && s.level === 'SUB').sort((a, b) => a.order - b.order);
                    if (subs.length === 0) {
                        newRows.push({ id: Math.random().toString(36).slice(2), core: core.name, sub: '', detail: '', technology: '' });
                        continue;
                    }
                    for (const sub of subs) {
                        const details = loadedSpecs.filter(s => s.parentId === sub.id && s.level === 'DETAIL').sort((a, b) => a.order - b.order);
                        if (details.length === 0) {
                            newRows.push({ id: Math.random().toString(36).slice(2), core: core.name, sub: sub.name, detail: '', technology: '' });
                            continue;
                        }
                        for (const detail of details) {
                            newRows.push({ id: Math.random().toString(36).slice(2), core: core.name, sub: sub.name, detail: detail.name, technology: detail.technology || '' });
                        }
                    }
                }
                if (newRows.length === 0) {
                    newRows.push({ id: Math.random().toString(36).slice(2), core: '', sub: '', detail: '', technology: '' });
                }
                setRows(newRows);
                setActiveMode('manual');
                showToast(`스펙이 자동 생성되었습니다 (${newRows.length}행)`, 'info');
            } else {
                showToast('자동 생성에 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('자동 생성 실패:', error);
            showToast('자동 생성에 실패했습니다.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const serializeSpecs = (): SpecFunction[] => {
        const specs: SpecFunction[] = [];
        let orderCounter = 0;
        const coreMap = new Map<string, string>();
        const subMap = new Map<string, string>();
        let lastCore = '';
        let lastSub = '';

        for (const row of rows) {
            const currentCore = row.core.trim() || lastCore;
            const currentSub = row.sub.trim() || (row.core.trim() ? '' : lastSub);

            if (!currentCore) continue; // 완전히 빈 행 스킵

            // Core 처리
            let coreId = coreMap.get(currentCore);
            if (!coreId) {
                coreId = `core_${orderCounter}`;
                specs.push({ id: coreId, level: 'CORE', name: currentCore, order: orderCounter++ });
                coreMap.set(currentCore, coreId);
            }

            lastCore = currentCore;

            if (!currentSub) {
                // Core만 있는 행 (Sub 없음) → Core만 저장하고 계속
                continue;
            }

            // Sub 처리
            const subKey = `${currentCore}_${currentSub}`;
            let subId = subMap.get(subKey);
            if (!subId) {
                subId = `sub_${orderCounter}`;
                specs.push({ id: subId, level: 'SUB', parentId: coreId, name: currentSub, order: orderCounter++ });
                subMap.set(subKey, subId);
            }

            lastSub = currentSub;

            // Detail 처리 (없어도 Sub는 이미 저장됨)
            if (!row.detail.trim()) {
                continue;
            }

            specs.push({
                id: `detail_${orderCounter}`,
                level: 'DETAIL',
                parentId: subId,
                name: row.detail.trim(),
                technology: row.technology.trim(),
                order: orderCounter++
            });
        }
        return specs;
    };


    // 저장
    const handleSave = async (redirect = false) => {
        setIsSaving(true);
        try {
            const finalSpecs = serializeSpecs();
            const res = await fetch(`/api/projects/${projectId}/spec`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ specFunctions: finalSpecs }),
            });
            if (res.ok) {
                if (redirect) {
                    router.push(`/project/${projectId}/requirements`);
                } else {
                    showToast('저장되었습니다.', 'success');
                }
            } else {
                showToast('저장에 실패했습니다.', 'error');
            }
        } catch (error) {
            showToast('저장에 실패했습니다.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-gray-400">로딩 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 relative">
            {/* 인라인 토스트 */}
            {toast && (
                <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border animate-fade-in ${toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200' :
                        toast.type === 'error' ? 'bg-red-900/90 border-red-500/40 text-red-200' :
                            'bg-blue-900/90 border-blue-500/40 text-blue-200'
                    }`}>
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                            toast.type === 'success' ? 'M5 13l4 4L19 7' :
                                toast.type === 'error' ? 'M6 18L18 6M6 6l12 12' :
                                    'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                        } />
                    </svg>
                    <span className="text-sm font-medium">{toast.message}</span>
                </div>
            )}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">AS-IS 스펙표</h2>
                    <p className="text-sm text-gray-400 mt-1">{project?.name || '기능 스펙 정의'}</p>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={addRow} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        행 추가
                    </button>
                    <button
                        onClick={() => handleSave(false)}
                        disabled={isSaving || rows.length === 0}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-4 mb-6 pt-2 border-t border-gray-800">
                <div className="glass-strong inline-flex p-1 rounded-xl">
                    <button
                        onClick={() => setActiveMode('manual')}
                        className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${activeMode === 'manual'
                            ? 'bg-primary-600/20 text-white border border-primary-500/25'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        수동 조작 모드
                    </button>
                    <button
                        onClick={() => setActiveMode('auto')}
                        className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${activeMode === 'auto'
                            ? 'bg-accent-600/20 text-white border border-accent-500/25'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        AI 자동 생성
                    </button>
                </div>
            </div>

            {
                activeMode === 'auto' && (
                    <div className="card max-w-lg mx-auto text-center py-12 mb-8 animate-fade-in border border-accent-500/20 bg-accent-500/5">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-accent-500/20 to-primary-500/20 border border-accent-500/20 flex items-center justify-center mb-6">
                            <svg className="w-8 h-8 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <h2 className="text-xl font-display font-bold text-white mb-3">AI 기반 스펙 자동 생성</h2>
                        <p className="text-gray-400 mb-8 text-sm">
                            프로젝트 정보를 분석하여 FAST 분석 기반의 기능 구조를 자동으로 생성합니다.
                        </p>
                        {rows.length > 0 && rows.some(r => r.core) && (
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-6 mx-auto max-w-sm">
                                <p className="text-amber-300 text-xs">
                                    ⚠️ 기존 스펙이 있습니다. 자동 생성 시 덮어쓰기됩니다.
                                </p>
                            </div>
                        )}
                        <button
                            onClick={handleAutoGenerate}
                            disabled={isGenerating}
                            className="btn-primary inline-flex items-center gap-2"
                        >
                            {isGenerating ? '생성 중...' : '스펙 자동 생성 (덮어쓰기)'}
                        </button>
                    </div>
                )
            }

            {
                activeMode === 'manual' && (
                    <div className="card overflow-x-auto bg-gray-900 p-0 rounded-lg border border-gray-700">
                        <table className="w-full border-collapse text-sm table-fixed">
                            <thead>
                                <tr className="bg-gray-800">
                                    <th className="border border-gray-700 p-2 text-gray-300 font-medium text-center w-[50px]">No</th>
                                    <th className="border border-gray-700 p-2 text-blue-400 font-medium text-center">핵심기능 (Core)</th>
                                    <th className="border border-gray-700 p-2 text-purple-400 font-medium text-center">세부기능 (Sub)</th>
                                    <th className="border border-gray-700 p-2 text-emerald-400 font-medium text-center">세세부기능 (Detail)</th>
                                    <th className="border border-gray-700 p-2 text-amber-400 font-medium text-center">적용 기술</th>
                                    <th className="border border-gray-700 p-2 text-gray-500 font-medium text-center w-[40px]"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="border border-gray-700 p-8 text-center text-gray-500 bg-gray-800/20">
                                            데이터가 없습니다. 우상단의 '행 추가' 버튼을 눌러 입력을 시작하세요.
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((row, idx) => (
                                        <tr key={row.id} className="hover:bg-gray-800/50 group transition-colors">
                                            <td className="border border-gray-700 p-0 text-center text-gray-500 bg-gray-800/30 select-none">{idx + 1}</td>
                                            <td className="border border-gray-700 p-0">
                                                <input
                                                    type="text"
                                                    value={row.core}
                                                    onChange={e => updateRow(row.id, 'core', e.target.value)}
                                                    className="w-full h-full p-2 bg-transparent text-blue-100 outline-none focus:bg-gray-800 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                                                    placeholder="입력 (이전과 동일시 생략가능)"
                                                />
                                            </td>
                                            <td className="border border-gray-700 p-0">
                                                <input
                                                    type="text"
                                                    value={row.sub}
                                                    onChange={e => updateRow(row.id, 'sub', e.target.value)}
                                                    className="w-full h-full p-2 bg-transparent text-purple-100 outline-none focus:bg-gray-800 focus:ring-1 focus:ring-purple-500/50 transition-colors"
                                                    placeholder="입력"
                                                />
                                            </td>
                                            <td className="border border-gray-700 p-0">
                                                <input
                                                    type="text"
                                                    value={row.detail}
                                                    onChange={e => updateRow(row.id, 'detail', e.target.value)}
                                                    className="w-full h-full p-2 bg-transparent text-emerald-100 outline-none focus:bg-gray-800 focus:ring-1 focus:ring-emerald-500/50 transition-colors"
                                                    placeholder="입력"
                                                />
                                            </td>
                                            <td className="border border-gray-700 p-0">
                                                <input
                                                    type="text"
                                                    value={row.technology}
                                                    onChange={e => updateRow(row.id, 'technology', e.target.value)}
                                                    className="w-full h-full p-2 bg-transparent text-amber-100 outline-none focus:bg-gray-800 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                                                    placeholder="입력"
                                                />
                                            </td>
                                            <td className="border border-gray-700 p-0 text-center relative pointer-events-auto">
                                                <button
                                                    onClick={() => deleteRow(row.id)}
                                                    className="w-full h-full py-2 text-transparent group-hover:text-red-500 hover:bg-red-500/10 transition-all font-bold"
                                                    title="행 삭제"
                                                >
                                                    ✕
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )
            }

            <div className="flex justify-end mt-4">
                <button
                    onClick={() => handleSave(true)}
                    disabled={isSaving || rows.length === 0}
                    className="btn-primary text-sm flex items-center gap-2"
                >
                    저장하고 요구사항으로 이동
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
            </div>
        </div>
    );
}
