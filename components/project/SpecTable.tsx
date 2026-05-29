'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buildFlatSpecRowsFromFunctions } from '@/lib/spec-table-utils';

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
    detailedDescription?: string;
}

interface SpecTableProps {
    projectId: string;
    onSaved?: () => void; // 저장 후 다음 워크시트(제품속성서) 이동 콜백
}

interface FlatSpecRow {
    id: string;
    core: string;
    sub: string;
    detail: string;
    technology: string;
}

interface GroupedSpecRow extends FlatSpecRow {
    coreRowSpan: number;
    subRowSpan: number;
}

export default function SpecTable({ projectId, onSaved }: SpecTableProps) {
    const router = useRouter();
    const [project, setProject] = useState<ProjectData | null>(null);
    const [rows, setRows] = useState<FlatSpecRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isUploadingExcel, setIsUploadingExcel] = useState(false);
    const [activeMode, setActiveMode] = useState<'manual' | 'auto'>('manual');
    const [showAiDetailPopup, setShowAiDetailPopup] = useState(false);
    const [aiDetailInput, setAiDetailInput] = useState('');
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const excelInputRef = useRef<HTMLInputElement | null>(null);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ message, type });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    const buildRowsFromSpecs = useCallback((loadedSpecs: SpecFunction[]) => {
        return buildFlatSpecRowsFromFunctions(loadedSpecs);
    }, []);

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
                    setRows(buildRowsFromSpecs(loadedSpecs));
                }
            } catch (error) {
                console.error('데이터 로딩 실패:', error);
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, [buildRowsFromSpecs, projectId]);

    const addRow = () => {
        setRows([...rows, { id: Math.random().toString(36).slice(2), core: '', sub: '', detail: '', technology: '' }]);
    };

    const insertRowAfter = (id: string, newRow: FlatSpecRow) => {
        const targetIndex = rows.findIndex(r => r.id === id);
        if (targetIndex === -1) {
            setRows([...rows, newRow]);
            return;
        }
        setRows([
            ...rows.slice(0, targetIndex + 1),
            newRow,
            ...rows.slice(targetIndex + 1),
        ]);
    };

    const addSubToCore = (row: FlatSpecRow) => {
        insertRowAfter(row.id, {
            id: Math.random().toString(36).slice(2),
            core: row.core.trim(),
            sub: '',
            detail: '',
            technology: '',
        });
    };

    const addDetailToSub = (row: FlatSpecRow) => {
        insertRowAfter(row.id, {
            id: Math.random().toString(36).slice(2),
            core: row.core.trim(),
            sub: row.sub.trim(),
            detail: '',
            technology: '',
        });
    };

    const updateRow = (id: string, field: keyof FlatSpecRow, value: string) => {
        setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const updateCoreGroup = (index: number, value: string) => {
        const currentCore = rows[index]?.core.trim();
        if (!currentCore) {
            updateRow(rows[index].id, 'core', value);
            return;
        }

        let start = index;
        while (start > 0 && rows[start - 1].core.trim() === currentCore) start--;
        let end = index;
        while (end + 1 < rows.length && rows[end + 1].core.trim() === currentCore) end++;

        setRows(rows.map((row, rowIndex) => (
            rowIndex >= start && rowIndex <= end ? { ...row, core: value } : row
        )));
    };

    const updateSubGroup = (index: number, value: string) => {
        const currentCore = rows[index]?.core.trim();
        const currentSub = rows[index]?.sub.trim();
        if (!currentSub) {
            updateRow(rows[index].id, 'sub', value);
            return;
        }

        let start = index;
        while (
            start > 0 &&
            rows[start - 1].core.trim() === currentCore &&
            rows[start - 1].sub.trim() === currentSub
        ) start--;
        let end = index;
        while (
            end + 1 < rows.length &&
            rows[end + 1].core.trim() === currentCore &&
            rows[end + 1].sub.trim() === currentSub
        ) end++;

        setRows(rows.map((row, rowIndex) => (
            rowIndex >= start && rowIndex <= end ? { ...row, sub: value } : row
        )));
    };

    const deleteRow = (id: string) => {
        setRows(rows.filter(r => r.id !== id));
    };

    const coreOptions = useMemo(() => {
        return Array.from(new Set(rows.map(row => row.core.trim()).filter(Boolean)));
    }, [rows]);

    const subOptionsByCore = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const row of rows) {
            const core = row.core.trim();
            const sub = row.sub.trim();
            if (!core || !sub) continue;
            const options = map.get(core) || [];
            if (!options.includes(sub)) options.push(sub);
            map.set(core, options);
        }
        return map;
    }, [rows]);

    const allSubOptions = useMemo(() => {
        return Array.from(new Set(rows.map(row => row.sub.trim()).filter(Boolean)));
    }, [rows]);

    const groupedRows = useMemo<GroupedSpecRow[]>(() => {
        return rows.map((row, index) => {
            const core = row.core.trim();
            const sub = row.sub.trim();
            const previous = rows[index - 1];
            const isFirstCore = !core || !previous || previous.core.trim() !== core;
            const isFirstSub = !sub || isFirstCore || !previous || previous.sub.trim() !== sub || previous.core.trim() !== core;

            let coreRowSpan = 0;
            if (isFirstCore) {
                coreRowSpan = 1;
                while (index + coreRowSpan < rows.length && core && rows[index + coreRowSpan].core.trim() === core) {
                    coreRowSpan++;
                }
            }

            let subRowSpan = 0;
            if (isFirstSub) {
                subRowSpan = 1;
                while (
                    index + subRowSpan < rows.length &&
                    sub &&
                    rows[index + subRowSpan].core.trim() === core &&
                    rows[index + subRowSpan].sub.trim() === sub
                ) {
                    subRowSpan++;
                }
            }

            return { ...row, coreRowSpan, subRowSpan };
        });
    }, [rows]);

    const handleSpecExcelUpload = async (file: File | null) => {
        if (!file) return;
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
            showToast('.xlsx 또는 .xls 파일만 업로드할 수 있습니다.', 'error');
            return;
        }

        setIsUploadingExcel(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch(`/api/projects/${projectId}/spec/upload-excel`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                const checkedSheets = data?.checkedSheets?.length
                    ? ` 확인한 시트: ${data.checkedSheets.join(', ')}`
                    : '';
                throw new Error(`${data?.error || '엑셀 업로드에 실패했습니다.'}${checkedSheets}`);
            }

            const loadedSpecs: SpecFunction[] = data.specFunctions || [];
            setRows(buildRowsFromSpecs(loadedSpecs));
            setActiveMode('manual');
            showToast(`${data.sheetName || '엑셀'}에서 AS-IS 스펙 ${data.specCount || loadedSpecs.length}개를 반영했습니다.`, 'success');
        } catch (error) {
            console.error('AS-IS 스펙 엑셀 업로드 실패:', error);
            showToast(error instanceof Error ? error.message : '엑셀 업로드에 실패했습니다.', 'error');
        } finally {
            setIsUploadingExcel(false);
            if (excelInputRef.current) excelInputRef.current.value = '';
        }
    };

    const handleAutoGenerate = async () => {
        const additionalDescription = aiDetailInput.trim();
        if (!additionalDescription) {
            showToast('제품이나 아이디어에 대한 상세 정보를 입력하세요.', 'error');
            return;
        }

        setIsGenerating(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/spec/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ additionalDescription }),
            });
            if (res.ok) {
                const data = await res.json();
                const loadedSpecs: SpecFunction[] = data.specFunctions || [];
                if (loadedSpecs.length > 0) {
                    const saveRes = await fetch(`/api/projects/${projectId}/spec`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ specFunctions: loadedSpecs }),
                    });
                    if (!saveRes.ok) {
                        const errorData = await saveRes.json().catch(() => null);
                        throw new Error(errorData?.error || 'Generated specs could not be saved.');
                    }
                }
                const newRows = buildRowsFromSpecs(loadedSpecs);
                setRows(newRows);
                setActiveMode('manual');
                setShowAiDetailPopup(false);
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

    const openAiDetailPopup = () => {
        setAiDetailInput(prev => prev || project?.detailedDescription || project?.description || '');
        setShowAiDetailPopup(true);
    };

    const serializeSpecs = (): SpecFunction[] => {
        const specs: SpecFunction[] = [];
        let orderCounter = 0;
        const coreMap = new Map<string, string>();
        const subMap = new Map<string, string>();
        const specById = new Map<string, SpecFunction>();
        let lastCore = '';
        let lastSub = '';

        for (const row of rows) {
            const currentCore = row.core.trim() || lastCore;
            const currentSub = row.sub.trim() || (row.core.trim() ? '' : lastSub);
            const technology = row.technology.trim();

            if (!currentCore) continue; // 완전히 빈 행 스킵

            // Core 처리
            let coreId = coreMap.get(currentCore);
            if (!coreId) {
                coreId = `core_${orderCounter}`;
                const coreSpec: SpecFunction = { id: coreId, level: 'CORE', name: currentCore, order: orderCounter++ };
                specs.push(coreSpec);
                specById.set(coreId, coreSpec);
                coreMap.set(currentCore, coreId);
            }

            lastCore = currentCore;

            if (!currentSub) {
                // Core만 있는 행 (Sub 없음) → Core만 저장하고 계속
                const coreSpec = specById.get(coreId);
                if (coreSpec && technology && !coreSpec.technology) coreSpec.technology = technology;
                continue;
            }

            // Sub 처리
            const subKey = `${currentCore}_${currentSub}`;
            let subId = subMap.get(subKey);
            if (!subId) {
                subId = `sub_${orderCounter}`;
                const subSpec: SpecFunction = { id: subId, level: 'SUB', parentId: coreId, name: currentSub, order: orderCounter++ };
                specs.push(subSpec);
                specById.set(subId, subSpec);
                subMap.set(subKey, subId);
            }

            lastSub = currentSub;

            // Detail 처리 (없어도 Sub는 이미 저장됨)
            if (!row.detail.trim()) {
                const subSpec = specById.get(subId);
                if (subSpec && technology && !subSpec.technology) subSpec.technology = technology;
                continue;
            }

            specs.push({
                id: `detail_${orderCounter}`,
                level: 'DETAIL',
                parentId: subId,
                name: row.detail.trim(),
                technology,
                order: orderCounter++
            });
        }
        return specs;
    };


    // 저장
    const handleSave = async (moveNext = false) => {
        setIsSaving(true);
        try {
            const finalSpecs = serializeSpecs();
            const res = await fetch(`/api/projects/${projectId}/spec`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ specFunctions: finalSpecs }),
            });
            if (res.ok) {
                if (moveNext) {
                    showToast('저장되었습니다. 제품속성서로 이동합니다...', 'success');
                    setTimeout(() => {
                        onSaved?.();
                    }, 1000);
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

    const handleReset = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/spec`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ specFunctions: [] }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => null);
                throw new Error(errorData?.error || 'AS-IS spec reset failed.');
            }

            setRows([]);
            setShowResetConfirm(false);
            showToast('AS-IS 스펙표가 초기화되었습니다.', 'success');
        } catch (error) {
            console.error('AS-IS 스펙표 초기화 실패:', error);
            showToast('AS-IS 스펙표 초기화에 실패했습니다.', 'error');
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
            {showAiDetailPopup && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4">
                    <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-gray-950 shadow-2xl">
                        <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
                            <div>
                                <h3 className="text-lg font-semibold text-white">AI 자동생성 상세 정보</h3>
                                <p className="mt-1 text-sm text-gray-400">
                                    제품이나 아이디어의 고객, 사용 상황, 주요 기능, 차별점, 제약 조건을 구체적으로 입력하세요.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAiDetailPopup(false)}
                                disabled={isGenerating}
                                className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-white disabled:opacity-50"
                                aria-label="닫기"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="space-y-4 px-6 py-5">
                            <textarea
                                value={aiDetailInput}
                                onChange={e => setAiDetailInput(e.target.value)}
                                disabled={isGenerating}
                                className="min-h-[220px] w-full resize-y rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm leading-6 text-white outline-none transition-colors placeholder:text-gray-600 focus:border-accent-500 focus:ring-1 focus:ring-accent-500 disabled:opacity-60"
                                placeholder="예: 누구를 위한 제품인지, 해결하려는 문제, 사용 흐름, 반드시 포함할 기능, 적용 기술, 운영/제조 제약, 경쟁 제품과 차별점 등을 입력하세요."
                            />
                            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-xs leading-5 text-blue-200">
                                입력한 내용은 이번 AS-IS 스펙 자동생성에만 사용되며, 생성 결과가 기존 스펙을 덮어씁니다.
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setShowAiDetailPopup(false)}
                                disabled={isGenerating}
                                className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white disabled:opacity-50"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleAutoGenerate}
                                disabled={isGenerating || !aiDetailInput.trim()}
                                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                            >
                                {isGenerating ? '생성 중...' : 'AI 자동생성 실행'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">AS-IS 스펙표</h2>
                    <p className="text-sm text-gray-400 mt-1">{project?.name || '기능 스펙 정의'}</p>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        ref={excelInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(event) => handleSpecExcelUpload(event.target.files?.[0] ?? null)}
                        className="hidden"
                        id={`spec-excel-upload-${projectId}`}
                    />
                    <label
                        htmlFor={`spec-excel-upload-${projectId}`}
                        className={`px-3 py-1.5 bg-emerald-900/40 hover:bg-emerald-800/60 border border-emerald-500/30 text-emerald-200 text-sm rounded transition-colors flex items-center gap-1 ${isSaving || isGenerating || isUploadingExcel ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
                        title="엑셀 파일의 AS-IS 스펙표 워크시트로 현재 스펙표를 완성합니다"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        {isUploadingExcel ? '업로드 중...' : '엑셀 업로드'}
                    </label>
                    <button onClick={addRow} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        행 추가
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowResetConfirm(true)}
                        disabled={isSaving || isGenerating}
                        className="px-3 py-1.5 bg-red-900/40 hover:bg-red-800/60 border border-red-500/30 text-red-200 text-sm rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        초기화
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

            {showResetConfirm && (
                <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-red-100">AS-IS 스펙표 초기화</h3>
                            <p className="mt-1 text-xs text-red-200/70">현재 AS-IS 스펙표의 모든 행이 삭제됩니다. 계속하시겠습니까?</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setShowResetConfirm(false)}
                                disabled={isSaving}
                                className="px-3 py-1.5 text-sm text-gray-300 hover:text-white disabled:opacity-50"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleReset}
                                disabled={isSaving}
                                className="px-4 py-1.5 rounded bg-red-600 hover:bg-red-500 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {isSaving ? '초기화 중...' : '모두 삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                            onClick={openAiDetailPopup}
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
                        <datalist id={`core-options-${projectId}`}>
                            {coreOptions.map(option => (
                                <option key={option} value={option} />
                            ))}
                        </datalist>
                        <table className="w-full border-collapse text-sm table-fixed">
                            <thead>
                                <tr className="bg-gray-800">
                                    <th className="border border-gray-700 p-2 text-gray-300 font-medium text-center w-[50px]">No</th>
                                    <th className="border border-gray-700 p-2 text-blue-400 font-medium text-center">핵심기능 (Core)</th>
                                    <th className="border border-gray-700 p-2 text-purple-400 font-medium text-center">세부기능 (Sub)</th>
                                    <th className="border border-gray-700 p-2 text-emerald-400 font-medium text-center">세세부기능 (Detail)</th>
                                    <th className="border border-gray-700 p-2 text-amber-400 font-medium text-center">적용 기술</th>
                                    <th className="border border-gray-700 p-2 text-gray-500 font-medium text-center w-[116px]"></th>
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
                                    groupedRows.map((row, idx) => {
                                        const subOptions = row.core.trim()
                                            ? (subOptionsByCore.get(row.core.trim()) || [])
                                            : allSubOptions;

                                        return (
                                        <tr key={row.id} className="hover:bg-gray-800/50 group transition-colors">
                                            <td className="border border-gray-700 p-0 text-center text-gray-500 bg-gray-800/30 select-none">{idx + 1}</td>
                                            {row.coreRowSpan > 0 && (
                                            <td className="border border-gray-700 p-0 align-top bg-blue-950/10" rowSpan={row.coreRowSpan}>
                                                <input
                                                    type="text"
                                                    list={`core-options-${projectId}`}
                                                    value={row.core}
                                                    onChange={e => updateCoreGroup(idx, e.target.value)}
                                                    className="w-full min-h-10 p-2 bg-transparent text-blue-100 outline-none focus:bg-gray-800 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                                                    placeholder="입력 (이전과 동일시 생략가능)"
                                                />
                                            </td>
                                            )}
                                            {row.subRowSpan > 0 && (
                                            <td className="border border-gray-700 p-0 align-top bg-purple-950/10" rowSpan={row.subRowSpan}>
                                                <datalist id={`sub-options-${row.id}`}>
                                                    {subOptions.map(option => (
                                                        <option key={option} value={option} />
                                                    ))}
                                                </datalist>
                                                <input
                                                    type="text"
                                                    list={`sub-options-${row.id}`}
                                                    value={row.sub}
                                                    onChange={e => updateSubGroup(idx, e.target.value)}
                                                    className="w-full min-h-10 p-2 bg-transparent text-purple-100 outline-none focus:bg-gray-800 focus:ring-1 focus:ring-purple-500/50 transition-colors"
                                                    placeholder="입력"
                                                />
                                            </td>
                                            )}
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
                                                <div className="flex h-full items-stretch justify-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => addSubToCore(row)}
                                                        disabled={!row.core.trim()}
                                                        className="w-9 py-2 text-xs text-blue-300 hover:bg-blue-500/10 disabled:text-gray-700 disabled:hover:bg-transparent transition-colors"
                                                        title="이 핵심기능에 세부기능 추가"
                                                    >
                                                        +S
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => addDetailToSub(row)}
                                                        disabled={!row.core.trim() || !row.sub.trim()}
                                                        className="w-9 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:text-gray-700 disabled:hover:bg-transparent transition-colors"
                                                        title="이 세부기능에 세세부기능 추가"
                                                    >
                                                        +D
                                                    </button>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteRow(row.id)}
                                                    className="w-9 py-2 text-transparent group-hover:text-red-500 hover:bg-red-500/10 transition-all font-bold"
                                                    title="행 삭제"
                                                >
                                                    ✕
                                                </button>
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })
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
                    저장하고 제품속성서로 이동
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
            </div>
        </div>
    );
}
