'use client';
// WS-11 개선포인트도출 표를 렌더링하는 클라이언트 컴포넌트입니다.

import { useEffect, useRef, useState } from 'react';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import { buildImprovementSuggestionsFromQfd } from '@/lib/worksheet-links';

interface ImprovementRow {
    id: string;
    customerNeed: string;
    improvementRate: string;
    devProportion: string;
    order: number;
}

interface ImprovementFeature {
    id: string;
    customerNeed: string;
    addedFeature: string;
    performanceImprovement: string;
    order: number;
}

interface Props {
    projectId: string;
}

interface SavedImprovementItem {
    id: string;
    type: string;
    content?: string | null;
    improvementRate?: string | null;
    devProportion?: string | null;
    order: number;
}

const MIN_FEATURE_ROWS = 5;

const createBlankFeatures = (): ImprovementFeature[] =>
    Array.from({ length: MIN_FEATURE_ROWS }, (_, index) => ({
        id: `blank_feature_${index}`,
        customerNeed: '',
        addedFeature: '',
        performanceImprovement: '',
        order: index,
    }));

const normalizeRows = (items: SavedImprovementItem[]): ImprovementRow[] =>
    items
        .filter((item) => item.type === 'need')
        .sort((a, b) => a.order - b.order)
        .map((item, index) => ({
            id: item.id,
            customerNeed: item.content ?? '',
            improvementRate: item.improvementRate ?? '',
            devProportion: item.devProportion ?? '',
            order: index,
        }));

const normalizeFeatures = (items: SavedImprovementItem[]): ImprovementFeature[] =>
    items
        .filter((item) => item.type === 'feature')
        .sort((a, b) => a.order - b.order)
        .map((item, index) => ({
            id: item.id,
            customerNeed: item.content ?? '',
            addedFeature: item.improvementRate ?? '',
            performanceImprovement: item.devProportion ?? '',
            order: index,
        }));

const syncFeaturesWithNeeds = (rows: ImprovementRow[], currentFeatures: ImprovementFeature[]): ImprovementFeature[] =>
    Array.from({ length: Math.max(MIN_FEATURE_ROWS, rows.length, currentFeatures.length) }, (_, index) => ({
        id: currentFeatures[index]?.id ?? `blank_feature_${index}`,
        customerNeed: rows[index]?.customerNeed ?? currentFeatures[index]?.customerNeed ?? '',
        addedFeature: currentFeatures[index]?.addedFeature ?? '',
        performanceImprovement: currentFeatures[index]?.performanceImprovement ?? '',
        order: index,
    }));

export default function ImprovementsTable({ projectId }: Props) {
    const [rows, setRows] = useState<ImprovementRow[]>([]);
    const [features, setFeatures] = useState<ImprovementFeature[]>([]);
    const [qfdData, setQfdData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 개선포인트는 니즈 표와 기능 표를 함께 저장하므로 둘을 한 값으로 본다.
    const { markClean } = useUnsavedChanges({ rows, features });

    const showToast = (message: string) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast(message);
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    const getQfdSuggestions = (source = qfdData?.requirements || []) => buildImprovementSuggestionsFromQfd(source);

    useEffect(() => {
        setIsLoading(true);
        Promise.all([
            fetch(`/api/projects/${projectId}/improvements`).then((response) => (response.ok ? response.json() : null)),
            fetch(`/api/projects/${projectId}/qfd/analysis`).then((response) => (response.ok ? response.json() : null)),
        ])
            .then(([data, qfdAnalysis]) => {
                const savedRows = normalizeRows(data?.items || []);
                const savedFeatures = normalizeFeatures(data?.items || []);
                const blankFeatures = savedFeatures.length > 0 ? savedFeatures : createBlankFeatures();

                const loadedFeatures = syncFeaturesWithNeeds(savedRows, blankFeatures);
                setRows(savedRows);
                setFeatures(loadedFeatures);
                markClean({ rows: savedRows, features: loadedFeatures });
                setQfdData(qfdAnalysis || data?.qfdAnalysis || null);
            })
            .catch((error) => {
                console.error(error);
                showToast('개선포인트 데이터를 불러오지 못했습니다.');
            })
            .finally(() => setIsLoading(false));
    }, [projectId, markClean]);

    useEffect(() => {
        setFeatures((currentFeatures) => {
            const synced = syncFeaturesWithNeeds(rows, currentFeatures);
            const isSame = synced.length === currentFeatures.length
                && synced.every((feature, index) =>
                    feature.id === currentFeatures[index]?.id
                    && feature.customerNeed === currentFeatures[index]?.customerNeed
                    && feature.addedFeature === currentFeatures[index]?.addedFeature
                    && feature.performanceImprovement === currentFeatures[index]?.performanceImprovement
                    && feature.order === currentFeatures[index]?.order
                );

            return isSame ? currentFeatures : synced;
        });
    }, [rows]);

    const customerNeedOptions = Array.from(new Set([
        ...getQfdSuggestions().map((suggestion) => suggestion.customerNeed),
        ...rows.map((row) => row.customerNeed),
    ].map((value) => value.trim()).filter(Boolean)));

    const rowOptions = (field: keyof Pick<ImprovementRow, 'improvementRate' | 'devProportion'>) =>
        Array.from(new Set(rows.map((row) => row[field].trim()).filter(Boolean)));

    const featureOptions = (field: keyof Pick<ImprovementFeature, 'addedFeature' | 'performanceImprovement'>) =>
        Array.from(new Set(features.map((feature) => feature[field].trim()).filter(Boolean)));

    const getQfdValuesForNeed = (customerNeed: string) => {
        const matched = getQfdSuggestions().find((suggestion) => suggestion.customerNeed.trim() === customerNeed.trim());
        if (!matched) return null;
        return {
            improvementRate: matched.improvementRate,
            devProportion: matched.devProportion,
        };
    };

    const addRow = () => setRows((prev) => {
        const existingNeeds = new Set(prev.map((row) => row.customerNeed.trim()).filter(Boolean));
        const nextSuggestion = getQfdSuggestions().find((suggestion) => !existingNeeds.has(suggestion.customerNeed.trim()));
        return [
            ...prev,
            {
                id: `new_${Date.now()}`,
                customerNeed: nextSuggestion?.customerNeed || '',
                improvementRate: nextSuggestion?.improvementRate || '',
                devProportion: nextSuggestion?.devProportion || '',
                order: prev.length,
            },
        ];
    });

    const addFeature = () => setFeatures((prev) => {
        const existingNeeds = new Set(prev.map((feature) => feature.customerNeed.trim()).filter(Boolean));
        const nextCustomerNeed = rows.find((row) => row.customerNeed && !existingNeeds.has(row.customerNeed.trim()))?.customerNeed || '';

        return [
            ...prev,
            {
                id: `newf_${Date.now()}`,
                customerNeed: nextCustomerNeed,
                addedFeature: '',
                performanceImprovement: '',
                order: prev.length,
            },
        ];
    });

    const updateRow = (id: string, field: keyof ImprovementRow, value: string) => setRows((prev) => prev.map((row) => {
        if (row.id !== id) return row;
        if (field !== 'customerNeed') return { ...row, [field]: value };

        return {
            ...row,
            customerNeed: value,
            ...(getQfdValuesForNeed(value) || {}),
        };
    }));

    const updateFeature = (id: string, field: keyof ImprovementFeature, value: string) =>
        setFeatures((prev) => prev.map((feature) => (feature.id === id ? { ...feature, [field]: value } : feature)));

    const deleteRow = (id: string) => {
        setRows((prev) => prev.filter((row) => row.id !== id).map((row, index) => ({ ...row, order: index })));
    };

    const deleteFeature = (id: string) => {
        setFeatures((prev) => prev.filter((feature) => feature.id !== id).map((feature, index) => ({ ...feature, order: index })));
    };

    const buildPayload = () => ({
        items: [
            ...rows
                .filter((row) => row.customerNeed.trim() || row.improvementRate.trim() || row.devProportion.trim())
                .map((row, index) => ({
                    type: 'need',
                    content: row.customerNeed,
                    improvementRate: row.improvementRate,
                    devProportion: row.devProportion,
                    order: index,
                })),
            ...features
                .filter((feature) => feature.customerNeed.trim() || feature.addedFeature.trim() || feature.performanceImprovement.trim())
                .map((feature, index) => ({
                    type: 'feature',
                    content: feature.customerNeed,
                    improvementRate: feature.addedFeature,
                    devProportion: feature.performanceImprovement,
                    order: index,
                })),
        ],
    });

    const applySavedItems = (items: SavedImprovementItem[]) => {
        const savedRows = normalizeRows(items);
        const savedFeatures = normalizeFeatures(items);
        const nextFeatures = syncFeaturesWithNeeds(savedRows, savedFeatures.length > 0 ? savedFeatures : createBlankFeatures());
        setRows(savedRows);
        setFeatures(nextFeatures);
        markClean({ rows: savedRows, features: nextFeatures });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/improvements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPayload()),
            });

            if (!response.ok) {
                showToast('저장에 실패했습니다.');
                return;
            }

            const data = await response.json();
            applySavedItems(data.items || []);
            showToast('저장되었습니다.');
        } catch (error) {
            console.error(error);
            showToast('저장에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        setIsSaving(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/improvements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: [] }),
            });

            if (!response.ok) {
                showToast('초기화에 실패했습니다.');
                return;
            }

            const blankFeatures = createBlankFeatures();
            setRows([]);
            setFeatures(blankFeatures);
            markClean({ rows: [], features: blankFeatures });
            setShowResetConfirm(false);
            showToast('입력 내용이 초기화되었습니다.');
        } catch (error) {
            console.error(error);
            showToast('초기화에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleImportFromQFD = () => {
        const suggestions = getQfdSuggestions();
        if (suggestions.length === 0) {
            showToast('QFD TOP5 데이터가 없습니다.');
            return;
        }

        const importedRows = suggestions.map((suggestion, index) => ({
            ...suggestion,
            order: index,
        }));
        setRows(importedRows);
        setFeatures((currentFeatures) => syncFeaturesWithNeeds(importedRows, currentFeatures));
        showToast('QFD TOP5 데이터를 반영했습니다.');
    };

    const cellInput = (
        value: string,
        onChange: (value: string) => void,
        placeholder: string,
        colorClass = 'text-white',
        optionsId?: string,
        options: string[] = []
    ) => (
        <>
            <input
                type="text"
                list={optionsId}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className={`w-full bg-transparent p-2.5 text-sm ${colorClass} border-none outline-none placeholder-gray-700 focus:ring-1 focus:ring-primary-500/50`}
                placeholder={placeholder}
            />
            {optionsId && (
                <datalist id={optionsId}>
                    {options.map((option) => <option key={option} value={option} />)}
                </datalist>
            )}
        </>
    );

    if (isLoading) {
        return <div className="flex items-center justify-center p-12"><div className="h-7 w-7 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" /></div>;
    }

    return (
        <div className="relative space-y-6">
            {toast && (
                <div className="fixed right-6 top-6 z-[100] flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-900/90 px-5 py-3 text-emerald-200 shadow-2xl animate-fade-in">
                    <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium">{toast}</span>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">[WS-11] 개선포인트도출</h2>
                    <p className="mt-1 text-sm text-gray-500">고객니즈 우선순위와 개선 기능, 성능향상 항목을 연결합니다.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={handleImportFromQFD} className="btn-secondary flex items-center gap-1.5 border-cyan-500/30 text-sm text-cyan-300 hover:bg-cyan-500/10">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        QFD TOP5 반영
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="btn-primary flex items-center gap-1.5 text-sm">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                    {(rows.length > 0 || features.some((feature) => feature.customerNeed || feature.addedFeature || feature.performanceImprovement)) && (
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
                            <p className="text-sm font-semibold text-white">개선포인트 입력을 초기화할까요?</p>
                            <p className="mt-0.5 text-xs text-rose-300/70">저장된 DB 데이터도 함께 삭제됩니다.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowResetConfirm(false)} className="btn-secondary text-sm">취소</button>
                            <button onClick={handleReset} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-500">초기화</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="card overflow-x-auto p-0">
                <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
                    <h3 className="text-base font-semibold text-white">고객니즈 우선순위</h3>
                    <button onClick={addRow} className="btn-secondary flex items-center gap-1 text-xs">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        행 추가
                    </button>
                </div>
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-white/[0.04]">
                            <th className="w-[50px] border border-white/[0.06] p-3 text-center text-gray-400">순위</th>
                            <th className="border border-white/[0.06] p-3 text-center font-semibold text-white">고객니즈</th>
                            <th className="min-w-[150px] border border-white/[0.06] p-3 text-center font-semibold text-cyan-300">경쟁사대비 수준향상율</th>
                            <th className="min-w-[120px] border border-white/[0.06] p-3 text-center font-semibold text-emerald-300">개발향상비중</th>
                            <th className="w-[40px] border border-white/[0.06] p-3" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="border border-white/[0.06] p-8 text-center">
                                    <p className="mb-3 text-sm text-gray-500">고객니즈 우선순위 데이터가 없습니다.</p>
                                    <button onClick={addRow} className="btn-primary text-sm">행 추가하기</button>
                                </td>
                            </tr>
                        ) : rows.map((row, index) => (
                            <tr key={row.id} className="group border-b border-white/[0.04] hover:bg-white/[0.02]">
                                <td className="border border-white/[0.06] p-2 text-center font-bold text-amber-300">{index + 1}</td>
                                <td className="border border-white/[0.06] p-0">
                                    {cellInput(row.customerNeed, (value) => updateRow(row.id, 'customerNeed', value), '고객니즈', 'text-white', `improve-need-${row.id}`, customerNeedOptions)}
                                </td>
                                <td className="border border-white/[0.06] p-0">
                                    {cellInput(row.improvementRate, (value) => updateRow(row.id, 'improvementRate', value), '예: 1.50', 'text-cyan-300 text-center', `improve-rate-${row.id}`, rowOptions('improvementRate'))}
                                </td>
                                <td className="border border-white/[0.06] p-0">
                                    {cellInput(row.devProportion, (value) => updateRow(row.id, 'devProportion', value), '예: 30.0%', 'text-emerald-300 text-center', `improve-proportion-${row.id}`, rowOptions('devProportion'))}
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
                    </tbody>
                </table>
            </div>

            <div className="card overflow-x-auto p-0">
                <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
                    <h3 className="text-base font-semibold text-white">개선 기능 및 성능 List</h3>
                    <button onClick={addFeature} className="btn-secondary flex items-center gap-1 text-xs">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        항목 추가
                    </button>
                </div>
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-white/[0.04]">
                            <th className="w-[50px] border border-white/[0.06] p-3 text-center text-gray-400">순위</th>
                            <th className="min-w-[360px] border border-white/[0.06] p-3 text-center font-semibold text-white">개선포인트 우선순위(고객니즈)</th>
                            <th className="min-w-[220px] border border-white/[0.06] p-3 text-center font-semibold text-cyan-300">추가 기능</th>
                            <th className="min-w-[220px] border border-white/[0.06] p-3 text-center font-semibold text-emerald-300">성능향상</th>
                            <th className="w-[40px] border border-white/[0.06] p-3" />
                        </tr>
                    </thead>
                    <tbody>
                        {features.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="border border-white/[0.06] p-8 text-center">
                                    <p className="mb-3 text-sm text-gray-500">개선 기능 및 성능 항목이 없습니다.</p>
                                    <button onClick={addFeature} className="btn-primary text-sm">항목 추가하기</button>
                                </td>
                            </tr>
                        ) : features.map((feature, index) => (
                            <tr key={feature.id} className="group border-b border-white/[0.04] hover:bg-white/[0.02]">
                                <td className="border border-white/[0.06] p-2 text-center font-bold text-amber-300">{index + 1}</td>
                                <td className="border border-white/[0.06] p-2.5 text-sm text-white">
                                    {feature.customerNeed || <span className="text-gray-600">-</span>}
                                </td>
                                <td className="border border-white/[0.06] p-0">
                                    {cellInput(feature.addedFeature, (value) => updateFeature(feature.id, 'addedFeature', value), '추가 기능', 'text-cyan-300', `improve-added-feature-${feature.id}`, featureOptions('addedFeature'))}
                                </td>
                                <td className="border border-white/[0.06] p-0">
                                    {cellInput(feature.performanceImprovement, (value) => updateFeature(feature.id, 'performanceImprovement', value), '성능향상', 'text-emerald-300', `improve-performance-${feature.id}`, featureOptions('performanceImprovement'))}
                                </td>
                                <td className="border border-white/[0.06] p-2 text-center">
                                    <button onClick={() => deleteFeature(feature.id)} className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-700 opacity-0 transition-colors hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
