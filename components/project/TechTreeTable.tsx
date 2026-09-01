'use client';
// WS-10 기능기술체계도 표를 렌더링하는 클라이언트 컴포넌트입니다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import { getTopRankedQfdRequirements, type RankedTechTreeRequirement } from '@/lib/tech-tree-qfd';
import { buildBlankTechTreeRows, buildTechTreeSpecOptions, type TechTreeSpecOption } from '@/lib/tech-tree-utils';

interface SpecFunction {
    id: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string;
    name: string;
    technology?: string;
    order?: number;
}

interface Requirement {
    id: string;
    requirement: string;
}

interface TechTreeRow {
    id: string;
    customerVoice: string;
    coreSpec: string;
    subSpec: string;
    techCharacteristic: string;
    order: number;
}

interface Props {
    projectId: string;
}

type GroupField = keyof Pick<TechTreeRow, 'customerVoice' | 'coreSpec' | 'subSpec' | 'techCharacteristic'>;
type SourceRequirement = Pick<RankedTechTreeRequirement, 'id' | 'requirement'>;

const getFieldScope = (field: GroupField): GroupField[] => {
    if (field === 'customerVoice') return [];
    if (field === 'coreSpec') return ['customerVoice'];
    if (field === 'subSpec') return ['customerVoice', 'coreSpec'];
    return ['customerVoice', 'coreSpec', 'subSpec'];
};

const sameScopedValue = (left: TechTreeRow | undefined, right: TechTreeRow | undefined, field: GroupField) => {
    if (!left || !right) return false;
    if (left[field].trim() !== right[field].trim()) return false;
    return getFieldScope(field).every((scopeField) => left[scopeField].trim() === right[scopeField].trim());
};

const normalizeRows = (entries: any[]): TechTreeRow[] =>
    entries.map((entry, index) => ({
        id: entry.id,
        customerVoice: entry.customerVoice ?? '',
        coreSpec: entry.coreSpec ?? '',
        subSpec: entry.subSpec ?? '',
        techCharacteristic: entry.techCharacteristic ?? '',
        order: Number.isFinite(entry.order) ? entry.order : index,
    }));

export default function TechTreeTable({ projectId }: Props) {
    const [rows, setRows] = useState<TechTreeRow[]>([]);
    const { markClean } = useUnsavedChanges(rows);
    const [specs, setSpecs] = useState<SpecFunction[]>([]);
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [qfdTopRequirements, setQfdTopRequirements] = useState<RankedTechTreeRequirement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [specPicker, setSpecPicker] = useState<{ rowIndex: number } | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ message, type });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    const buildGeneratedRows = (sourceRequirements: SourceRequirement[], sourceSpecs: SpecFunction[]) =>
        buildBlankTechTreeRows(sourceRequirements, sourceSpecs);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [specRes, reqRes, treeRes, qfdRes] = await Promise.all([
                fetch(`/api/projects/${projectId}/spec`),
                fetch(`/api/projects/${projectId}/requirements`),
                fetch(`/api/projects/${projectId}/tech-tree`),
                fetch(`/api/projects/${projectId}/qfd/analysis`),
            ]);

            let nextSpecs: SpecFunction[] = [];
            let nextQfdTopRequirements: RankedTechTreeRequirement[] = [];

            if (specRes.ok) {
                const data = await specRes.json();
                nextSpecs = data.specFunctions || [];
                setSpecs(nextSpecs);
            }

            if (reqRes.ok) {
                const data = await reqRes.json();
                setRequirements(data.requirements || []);
            }

            if (qfdRes.ok) {
                const data = await qfdRes.json();
                nextQfdTopRequirements = getTopRankedQfdRequirements(data.requirements || [], 5);
                setQfdTopRequirements(nextQfdTopRequirements);
            }

            if (treeRes.ok) {
                const data = await treeRes.json();
                const savedRows = normalizeRows(data.entries || []);
                setRows(markClean(savedRows.length > 0 ? savedRows : buildGeneratedRows(nextQfdTopRequirements, nextSpecs)));
            }
        } catch (error) {
            console.error(error);
            showToast('기능기술체계도 데이터를 불러오지 못했습니다.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [projectId, markClean]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const save = async (data: TechTreeRow[]) => {
        const response = await fetch(`/api/projects/${projectId}/tech-tree`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                entries: data.map((row, index) => ({
                    customerVoice: row.customerVoice,
                    coreSpec: row.coreSpec,
                    subSpec: row.subSpec,
                    techCharacteristic: row.techCharacteristic,
                    order: index,
                })),
            }),
        });

        if (!response.ok) return false;

        const dataJson = await response.json();
        setRows(markClean(normalizeRows(dataJson.entries || [])));
        return true;
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const ok = await save(rows);
            showToast(ok ? '저장되었습니다.' : '저장에 실패했습니다.', ok ? 'success' : 'error');
        } catch (error) {
            console.error(error);
            showToast('저장에 실패했습니다.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        setIsSaving(true);
        try {
            const ok = await save([]);
            if (ok) {
                setRows(markClean([]));
                setShowResetConfirm(false);
                showToast('초기화되었습니다.');
            } else {
                showToast('초기화에 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('초기화에 실패했습니다.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const autoGenerate = () => {
        const sourceRequirements = qfdTopRequirements.length > 0
            ? qfdTopRequirements
            : requirements.map((req) => ({ id: req.id, requirement: req.requirement }));
        const generated = buildGeneratedRows(sourceRequirements, specs);
        setRows(generated.map((row, index) => ({ ...row, order: index })));
        showToast(
            qfdTopRequirements.length > 0
                ? `QFD 랭킹 1~5위 항목 ${qfdTopRequirements.length}개를 반영했습니다.`
                : `${generated.length}개 행을 자동 생성했습니다.`,
            'info'
        );
    };

    const addRow = () => setRows((prev) => [
        ...prev,
        { id: `new_${Date.now()}`, customerVoice: '', coreSpec: '', subSpec: '', techCharacteristic: '', order: prev.length },
    ]);

    const deleteRow = (id: string) => {
        setRows((prev) => prev.filter((row) => row.id !== id).map((row, index) => ({ ...row, order: index })));
    };

    const getUniqueValues = (field: 'coreSpec' | 'subSpec' | 'techCharacteristic') =>
        Array.from(new Set(rows.map((row) => row[field].trim()).filter(Boolean)));

    const specOptions = buildTechTreeSpecOptions(specs);
    const coreSpecOptions = Array.from(new Set([...specOptions.map((option) => option.coreSpec), ...getUniqueValues('coreSpec')].map((value) => value.trim()).filter(Boolean)));
    const subSpecOptions = Array.from(new Set([...specOptions.map((option) => option.subSpec), ...getUniqueValues('subSpec')].map((value) => value.trim()).filter(Boolean)));
    const techCharacteristicOptions = Array.from(new Set([...specOptions.map((option) => option.techCharacteristic), ...getUniqueValues('techCharacteristic')].map((value) => value.trim()).filter(Boolean)));

    const shouldShowValue = (index: number, field: GroupField) => {
        const value = rows[index]?.[field].trim();
        if (!value) return true;
        return !sameScopedValue(rows[index - 1], rows[index], field);
    };

    const getValueRowSpan = (index: number, field: GroupField) => {
        const value = rows[index]?.[field].trim();
        if (!value) return 1;

        let span = 1;
        for (let nextIndex = index + 1; nextIndex < rows.length; nextIndex += 1) {
            if (!sameScopedValue(rows[index], rows[nextIndex], field)) break;
            span += 1;
        }
        return span;
    };

    const getGroupRange = (index: number, field: GroupField) => {
        const row = rows[index];
        if (!row || !row[field].trim()) return { start: index, end: index };

        let start = index;
        while (start > 0 && sameScopedValue(rows[start - 1], row, field)) {
            start -= 1;
        }

        let end = index;
        while (end + 1 < rows.length && sameScopedValue(rows[end + 1], row, field)) {
            end += 1;
        }

        return { start, end };
    };

    const updateValueGroup = (index: number, field: GroupField, value: string) => {
        const row = rows[index];
        if (!row) return;

        const currentValue = row[field].trim();
        if (!currentValue) {
            setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, [field]: value } : item)));
            return;
        }

        const range = getGroupRange(index, field);
        const ids = new Set(rows.slice(range.start, range.end + 1).map((item) => item.id));
        setRows((prev) => prev.map((item) => (ids.has(item.id) ? { ...item, [field]: value } : item)));
    };

    const addCoreSpecForVoice = (index: number) => {
        const row = rows[index];
        if (!row) return;

        const voiceRange = getGroupRange(index, 'customerVoice');
        const nextRows = [...rows];
        nextRows.splice(voiceRange.end + 1, 0, {
            id: `core_${Date.now()}`,
            customerVoice: row.customerVoice,
            coreSpec: '',
            subSpec: '',
            techCharacteristic: '',
            order: voiceRange.end + 1,
        });
        setRows(nextRows.map((item, itemIndex) => ({ ...item, order: itemIndex })));
    };

    const deleteCoreSpecGroup = (index: number) => {
        const range = getGroupRange(index, 'coreSpec');
        const remainingRows = rows
            .filter((_, itemIndex) => itemIndex < range.start || itemIndex > range.end)
            .map((item, itemIndex) => ({ ...item, order: itemIndex }));
        setRows(remainingRows);
    };

    const applySpecOption = (index: number, option: TechTreeSpecOption) => {
        const row = rows[index];
        if (!row) return;

        const range = getGroupRange(index, 'subSpec');
        const ids = new Set(rows.slice(range.start, range.end + 1).map((item) => item.id));
        setRows((prev) => prev.map((item) => (
            ids.has(item.id)
                ? {
                    ...item,
                    coreSpec: option.coreSpec,
                    subSpec: option.subSpec,
                    techCharacteristic: option.techCharacteristic,
                }
                : item
        )));
        setSpecPicker(null);
    };

    if (isLoading) {
        return <div className="flex items-center justify-center p-12"><div className="h-7 w-7 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" /></div>;
    }

    const canAutoGenerate = specs.length > 0 || requirements.length > 0 || qfdTopRequirements.length > 0;

    return (
        <div className="relative space-y-4">
            {toast && (
                <div className={`fixed right-6 top-6 z-[100] flex items-center gap-3 rounded-xl border px-5 py-3 shadow-2xl animate-fade-in ${
                    toast.type === 'error'
                        ? 'border-rose-500/40 bg-rose-900/90 text-rose-200'
                        : toast.type === 'info'
                            ? 'border-blue-500/40 bg-blue-900/90 text-blue-200'
                            : 'border-emerald-500/40 bg-emerald-900/90 text-emerald-200'
                }`}>
                    <span className="text-sm font-medium">{toast.message}</span>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">[WS-10] 기능기술체계도</h2>
                    <p className="mt-1 text-sm text-gray-500">고객의 소리와 핵심스펙, 세부스펙, 기술적 특성을 연결합니다.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {canAutoGenerate && (
                        <button onClick={autoGenerate} className="btn-secondary flex items-center gap-1.5 text-sm">
                            <svg className="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            {qfdTopRequirements.length > 0 ? 'QFD TOP5 반영' : '자동 생성'}
                        </button>
                    )}
                    <button onClick={addRow} className="btn-secondary flex items-center gap-1.5 text-sm">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        행 추가
                    </button>
                    <button onClick={handleSave} disabled={rows.length === 0 || isSaving} className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                    {rows.length > 0 && (
                        <button onClick={() => setShowResetConfirm(true)} className="rounded-lg px-3 py-2 text-sm text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {showResetConfirm && (
                <div className="card border-rose-500/25 bg-rose-500/[0.04] animate-fade-in">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-semibold text-white">기능기술체계도를 초기화할까요?</p>
                            <p className="mt-0.5 text-xs text-rose-300/70">모든 행이 삭제됩니다.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowResetConfirm(false)} className="btn-secondary text-sm">취소</button>
                            <button onClick={handleReset} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-500">초기화</button>
                        </div>
                    </div>
                </div>
            )}

            {specPicker && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-3xl rounded-xl border border-white/[0.10] bg-surface-900 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-white/[0.08] p-4">
                            <div>
                                <h3 className="text-base font-semibold text-white">AS-IS 세부스펙 선택</h3>
                                <p className="mt-1 text-xs text-gray-500">WS-2의 세부스펙을 선택하면 핵심스펙과 기술적 특성이 함께 반영됩니다.</p>
                            </div>
                            <button type="button" onClick={() => setSpecPicker(null)} className="rounded-lg p-2 text-gray-500 hover:bg-white/[0.06] hover:text-white">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-4">
                            {specOptions.length === 0 ? (
                                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-8 text-center text-sm text-gray-500">WS-2 AS-IS 스펙 후보가 없습니다.</div>
                            ) : (
                                <div className="space-y-2">
                                    {specOptions.map((option, optionIndex) => (
                                        <button
                                            key={`${option.coreSpec}-${option.subSpec}-${option.techCharacteristic}-${optionIndex}`}
                                            type="button"
                                            onClick={() => applySpecOption(specPicker.rowIndex, option)}
                                            className="grid w-full grid-cols-[1fr_1fr_1.2fr] gap-3 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-left text-sm transition-colors hover:border-purple-500/40 hover:bg-purple-500/[0.08]"
                                        >
                                            <span className="text-blue-200">{option.coreSpec || '-'}</span>
                                            <span className="font-medium text-purple-200">{option.subSpec || '-'}</span>
                                            <span className="text-cyan-200">{option.techCharacteristic || '-'}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {rows.length === 0 ? (
                <div className="card py-14 text-center">
                    <h3 className="mb-2 text-lg font-display font-semibold text-white">기능기술체계도를 작성하세요</h3>
                    <p className="mb-5 text-sm text-gray-500">고객의 소리와 제품 기능 스펙, 기술특성을 연결합니다.</p>
                    <div className="flex items-center justify-center gap-3">
                        {canAutoGenerate && (
                            <button onClick={autoGenerate} className="btn-primary flex items-center gap-1.5 text-sm">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                {qfdTopRequirements.length > 0 ? 'QFD TOP5 반영' : '스펙에서 자동 생성'}
                            </button>
                        )}
                        <button onClick={addRow} className="btn-secondary flex items-center gap-1.5 text-sm">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            직접 입력
                        </button>
                    </div>
                </div>
            ) : (
                <div className="card overflow-x-auto p-0">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-white/[0.08] bg-white/[0.04]">
                                <th className="min-w-[180px] border border-white/[0.06] p-3 text-center font-semibold text-amber-300">고객의 소리</th>
                                <th className="min-w-[140px] border border-white/[0.06] p-3 text-center font-semibold text-blue-300">핵심스펙(기능)</th>
                                <th className="min-w-[140px] border border-white/[0.06] p-3 text-center font-semibold text-purple-300">세부스펙(기능)</th>
                                <th className="min-w-[180px] border border-white/[0.06] p-3 text-center font-semibold text-cyan-300">기술적 특성</th>
                                <th className="w-[50px] border border-white/[0.06] p-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={row.id} className="group border-b border-white/[0.04] hover:bg-white/[0.02]">
                                    {shouldShowValue(rowIndex, 'customerVoice') && (
                                        <td rowSpan={getValueRowSpan(rowIndex, 'customerVoice')} className="border border-white/[0.06] p-0 align-top">
                                            <div className="flex h-full flex-col">
                                                <textarea
                                                    value={row.customerVoice}
                                                    onChange={(event) => updateValueGroup(rowIndex, 'customerVoice', event.target.value)}
                                                    className="h-full min-h-[52px] w-full resize-none border-none bg-transparent p-2.5 text-sm text-white outline-none placeholder-gray-700 focus:ring-1 focus:ring-amber-500/50"
                                                    placeholder="고객 요구사항"
                                                    rows={2}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => addCoreSpecForVoice(rowIndex)}
                                                    className="border-t border-white/[0.06] px-2.5 py-1.5 text-left text-xs text-amber-300 transition-colors hover:bg-amber-500/10 hover:text-amber-100"
                                                >
                                                    + 핵심스펙 추가
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                    {shouldShowValue(rowIndex, 'coreSpec') && (
                                        <td rowSpan={getValueRowSpan(rowIndex, 'coreSpec')} className="border border-white/[0.06] p-0 align-top">
                                            <div className="flex h-full flex-col">
                                                <input
                                                    type="text"
                                                    list={`tech-tree-core-${row.id}`}
                                                    value={row.coreSpec}
                                                    onChange={(event) => updateValueGroup(rowIndex, 'coreSpec', event.target.value)}
                                                    className="w-full border-none bg-transparent p-2.5 text-sm font-medium text-white outline-none placeholder-gray-700 focus:ring-1 focus:ring-blue-500/50"
                                                    placeholder="핵심 기능"
                                                />
                                                <datalist id={`tech-tree-core-${row.id}`}>
                                                    {coreSpecOptions.map((value) => <option key={value} value={value} />)}
                                                </datalist>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteCoreSpecGroup(rowIndex)}
                                                    className="border-t border-white/[0.06] px-2.5 py-1.5 text-left text-xs text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-100"
                                                >
                                                    - 핵심스펙 삭제
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                    {shouldShowValue(rowIndex, 'subSpec') && (
                                        <td rowSpan={getValueRowSpan(rowIndex, 'subSpec')} className="border border-white/[0.06] p-0 align-top">
                                            <div className="flex items-stretch">
                                                <input
                                                    type="text"
                                                    list={`tech-tree-sub-${row.id}`}
                                                    value={row.subSpec}
                                                    onChange={(event) => updateValueGroup(rowIndex, 'subSpec', event.target.value)}
                                                    className="min-h-[42px] flex-1 bg-transparent p-2.5 text-sm text-white outline-none placeholder-gray-700 transition-colors focus:ring-1 focus:ring-purple-500/50"
                                                    placeholder="세부 기능"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setSpecPicker({ rowIndex })}
                                                    className="border-l border-white/[0.06] px-2 text-xs text-purple-300 transition-colors hover:bg-purple-500/10 hover:text-purple-100"
                                                    title="AS-IS 세부스펙 선택"
                                                >
                                                    선택
                                                </button>
                                            </div>
                                            <datalist id={`tech-tree-sub-${row.id}`}>
                                                {subSpecOptions.map((value) => <option key={value} value={value} />)}
                                            </datalist>
                                        </td>
                                    )}
                                    {shouldShowValue(rowIndex, 'techCharacteristic') && (
                                        <td rowSpan={getValueRowSpan(rowIndex, 'techCharacteristic')} className="border border-white/[0.06] bg-cyan-900/[0.06] p-0 align-top">
                                            <input
                                                type="text"
                                                list={`tech-tree-tech-${row.id}`}
                                                value={row.techCharacteristic}
                                                onChange={(event) => updateValueGroup(rowIndex, 'techCharacteristic', event.target.value)}
                                                className="w-full border-none bg-transparent p-2.5 text-sm text-cyan-300 outline-none placeholder-gray-700 focus:ring-1 focus:ring-cyan-500/50"
                                                placeholder="기술적 특성"
                                            />
                                            <datalist id={`tech-tree-tech-${row.id}`}>
                                                {techCharacteristicOptions.map((value) => <option key={value} value={value} />)}
                                            </datalist>
                                        </td>
                                    )}
                                    <td className="border border-white/[0.06] p-2 text-center">
                                        <button onClick={() => deleteRow(row.id)} className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-700 opacity-0 transition-colors hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100">
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="flex items-center justify-between border-t border-white/[0.06] p-3">
                        <button onClick={addRow} className="group flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-300">
                            <div className="flex h-6 w-6 items-center justify-center rounded border-2 border-dashed border-gray-700 transition-colors group-hover:border-gray-500">
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </div>
                            행 추가
                        </button>
                        <span className="text-xs text-gray-600">{rows.length}개 행</span>
                    </div>
                </div>
            )}
        </div>
    );
}
