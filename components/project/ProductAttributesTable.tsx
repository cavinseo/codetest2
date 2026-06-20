'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    buildSpecPickerRows,
    getCustomerNameSpan,
    getMarketSegmentSpan,
    resolveRelatedTechnology,
} from '@/lib/product-attributes-utils';

interface ProductAttributeRow {
    id: string;
    productName: string;
    customerName: string;
    marketSegment: string;
    customerNeed: string;
    benefit: string;
    attribute: string;
    techCapability: string;
    order: number;
}

interface SpecFunction {
    id: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string;
    name: string;
    technology?: string;
    order?: number;
}

interface ProductAttributesTableProps {
    projectId: string;
    onSaved?: () => void;
}

type ToastType = 'success' | 'error';

// ─────────────────────────────────────────
// AS-IS 스펙 엑셀 워크시트 형식 테이블 컴포넌트
// ─────────────────────────────────────────
interface FlatRow {
    rowNo: number;
    core: string;
    sub: string;
    detail: string;
    technology: string;
    pickValue: string; // attribute 모드: 기능명, techCapability 모드: 기술명
    pickTech: string;
}

function buildFlatRows(specs: SpecFunction[], field: 'attribute' | 'techCapability'): FlatRow[] {
    return buildSpecPickerRows(specs, field);
}

function SpecSheetTable({
    specFunctions,
    field,
    onPick,
}: {
    specFunctions: SpecFunction[];
    field: 'attribute' | 'techCapability';
    onPick: (value: string, technology: string, options?: { autoFillTech?: boolean }) => void;
}) {
    const flatRows = buildFlatRows(specFunctions, field);

    // 행병합을 위한 헬퍼: 연속된 같은 값의 첫 행만 rowspan 계산
    const getRowSpan = (arr: FlatRow[], key: 'core' | 'sub', index: number): number => {
        if (index > 0 && arr[index][key] === arr[index - 1][key]) return 0; // 0이면 td 숨김
        let count = 1;
        for (let i = index + 1; i < arr.length; i++) {
            if (arr[i][key] === arr[index][key] && (key === 'core' || arr[i].core === arr[index].core)) count++;
            else break;
        }
        return count;
    };

    const isHighlighted = field === 'attribute';

    return (
        <table className="w-full border-collapse text-sm">
            <thead>
                <tr className="bg-white/[0.06] border-b border-white/[0.08] sticky top-0 z-10">
                    <th className="border border-white/[0.08] px-3 py-2.5 text-gray-400 font-medium text-center w-[50px]">No.</th>
                    <th className="border border-white/[0.08] px-3 py-2.5 text-blue-300 font-semibold text-center w-[160px]">핵심기능 (Core)</th>
                    <th className="border border-white/[0.08] px-3 py-2.5 text-purple-300 font-semibold text-center w-[160px]">세부기능 (Sub)</th>
                    <th className="border border-white/[0.08] px-3 py-2.5 text-emerald-300 font-semibold text-center">세세부기능 (Detail)</th>
                    <th className="border border-white/[0.08] px-3 py-2.5 text-amber-300 font-semibold text-center w-[180px]">적용 기술</th>
                </tr>
            </thead>
            <tbody>
                {flatRows.length === 0 ? (
                    <tr>
                        <td colSpan={5} className="border border-white/[0.08] p-10 text-center text-gray-500 text-sm">
                            스펙 데이터가 없습니다.
                        </td>
                    </tr>
                ) : (
                    flatRows.map((row, idx) => {
                        const coreSpan = getRowSpan(flatRows, 'core', idx);
                        const subSpan = getRowSpan(flatRows, 'sub', idx);

                        // 클릭 시 가져올 값 결정
                        const clickValue = field === 'attribute'
                            ? (row.detail || row.sub || row.core)
                            : (row.technology || row.detail || row.sub || row.core);
                        const clickTechnology = field === 'attribute' && row.detail
                            ? row.technology
                            : field === 'techCapability'
                                ? row.technology
                                : '';

                        return (
                            <tr
                                key={idx}
                                onClick={() => onPick(clickValue, clickTechnology, { autoFillTech: Boolean(clickTechnology) })}
                                className={`border-b border-white/[0.04] cursor-pointer transition-colors
                                    ${isHighlighted
                                        ? 'hover:bg-cyan-500/10'
                                        : 'hover:bg-amber-500/10'
                                    }`}
                                title={`클릭하여 '${clickValue}' 적용`}
                            >
                                {/* No */}
                                <td className="border border-white/[0.06] px-3 py-2 text-center text-gray-600 text-xs select-none">
                                    {row.rowNo}
                                </td>

                                {/* Core - 행병합 */}
                                {coreSpan > 0 && (
                                    <td
                                        rowSpan={coreSpan}
                                        className="border border-white/[0.06] px-3 py-2 text-blue-200 font-medium text-sm align-middle"
                                    >
                                        {row.core}
                                    </td>
                                )}

                                {/* Sub - 행병합 */}
                                {subSpan > 0 && (
                                    <td
                                        rowSpan={subSpan}
                                        onClick={(event) => {
                                            if (field !== 'attribute' || !row.sub) return;
                                            event.stopPropagation();
                                            onPick(row.sub, '', { autoFillTech: false });
                                        }}
                                        className={`border border-white/[0.06] px-3 py-2 text-purple-200 text-sm align-middle ${field === 'attribute' && row.sub ? 'cursor-pointer hover:bg-cyan-500/10 hover:text-cyan-100' : ''}`}
                                        title={field === 'attribute' && row.sub ? `세부기능 '${row.sub}'을 제품속성으로 선택` : undefined}
                                    >
                                        {row.sub}
                                    </td>
                                )}
                                {/* sub가 0이라는 건 병합됐다는 뜻이므로 td 없음 */}

                                {/* Detail */}
                                <td className={`border border-white/[0.06] px-3 py-2 text-sm align-middle
                                    ${field === 'attribute' && row.detail ? 'text-emerald-200 font-medium' : 'text-gray-400'}`}>
                                    {row.detail || <span className="text-gray-700 italic text-xs">—</span>}
                                </td>

                                {/* 기술 */}
                                <td className={`border border-white/[0.06] px-3 py-2 text-sm align-middle font-mono
                                    ${field === 'techCapability' && row.technology ? 'text-amber-200 font-semibold' : 'text-gray-500'}`}>
                                    {row.technology || <span className="text-gray-700 italic text-xs">—</span>}
                                </td>
                            </tr>
                        );
                    })
                )}
            </tbody>
        </table>
    );
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────
export default function ProductAttributesTable({ projectId, onSaved }: ProductAttributesTableProps) {
    const templateDownloadUrl = `/api/projects/${projectId}/import/template?sheet=attributes`;
    const [rows, setRows] = useState<ProductAttributeRow[]>([]);
    const [specFunctions, setSpecFunctions] = useState<SpecFunction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showSpecPicker, setShowSpecPicker] = useState<{ rowId: string; field: 'attribute' | 'techCapability' } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingExcel, setIsUploadingExcel] = useState(false);
    const [productName, setProductName] = useState('');
    const [importedFields, setImportedFields] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [pendingExcelFile, setPendingExcelFile] = useState<File | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const excelInputRef = useRef<HTMLInputElement | null>(null);

    const showToast = (message: string, type: ToastType = 'success') => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ message, type });
        toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    };

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [attrRes, specRes, projRes] = await Promise.all([
                fetch(`/api/projects/${projectId}/attributes`),
                fetch(`/api/projects/${projectId}/spec`),
                fetch('/api/projects'),
            ]);

            if (projRes.ok) {
                const projData = await projRes.json();
                const found = projData.projects?.find((p: any) => p.id === projectId);
                if (found) {
                    setProductName((current) => current || found.name || '');
                }
            }

            let loadedAttrs: any[] = [];
            if (attrRes.ok) {
                const data = await attrRes.json();
                loadedAttrs = data.attributes || [];
                setRows(loadedAttrs.map((a: any) => ({
                    id: a.id,
                    productName: a.productName || '',
                    customerName: a.customerName || '',
                    marketSegment: a.marketSegment || '',
                    customerNeed: a.customerNeed || '',
                    benefit: a.benefit || '',
                    attribute: a.attribute || '',
                    techCapability: a.techCapability || '',
                    order: a.order || 0,
                })));
                if (loadedAttrs.length > 0 && loadedAttrs[0].productName) {
                    setProductName(loadedAttrs[0].productName);
                }
            }

            let loadedSpecs: SpecFunction[] = [];
            if (specRes.ok) {
                const data = await specRes.json();
                loadedSpecs = data.specFunctions || [];
                setSpecFunctions(loadedSpecs);
            }

            if (loadedAttrs.length > 0 && loadedSpecs.length > 0) {
                const specNames = new Set(loadedSpecs.map(f => f.name));
                const specTechs = new Set(loadedSpecs.filter(f => f.technology).map(f => f.technology!));
                const autoImported = new Set<string>();
                loadedAttrs.forEach((a: any) => {
                    if (a.attribute && specNames.has(a.attribute)) {
                        autoImported.add(`${a.id}_attribute`);
                    }
                    if (a.techCapability && (specTechs.has(a.techCapability) || specNames.has(a.techCapability))) {
                        autoImported.add(`${a.id}_techCapability`);
                    }
                });
                setImportedFields(autoImported);
            }
        } catch (error) {
            console.error('데이터 로드 실패:', error);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const createRow = (order: number, overrides: Partial<ProductAttributeRow> = {}): ProductAttributeRow => ({
            id: `attr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            productName: '',
            customerName: '',
            marketSegment: '',
            customerNeed: '',
            benefit: '',
            attribute: '',
            techCapability: '',
            order,
            ...overrides,
    });

    const addRow = () => {
        setRows([...rows, createRow(rows.length)]);
    };

    const addSegmentItem = (row: ProductAttributeRow) => {
        const targetIndex = rows.findIndex(r => r.id === row.id);
        const newRow = createRow(rows.length, { marketSegment: row.marketSegment });
        const nextRows = targetIndex === -1
            ? [...rows, newRow]
            : [
                ...rows.slice(0, targetIndex + 1),
                newRow,
                ...rows.slice(targetIndex + 1),
            ];
        setRows(nextRows.map((r, order) => ({ ...r, order })));
    };

    const addCustomerNeedItem = (row: ProductAttributeRow) => {
        const targetIndex = rows.findIndex(r => r.id === row.id);
        const newRow = createRow(rows.length, {
            marketSegment: row.marketSegment,
            customerName: row.customerName,
        });
        const nextRows = targetIndex === -1
            ? [...rows, newRow]
            : [
                ...rows.slice(0, targetIndex + 1),
                newRow,
                ...rows.slice(targetIndex + 1),
            ];
        setRows(nextRows.map((r, order) => ({ ...r, order })));
    };

    const updateRow = (id: string, field: keyof ProductAttributeRow, value: string) => {
        setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const deleteRow = (id: string) => {
        setRows(rows.filter(r => r.id !== id).map((r, order) => ({ ...r, order })));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/attributes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attributes: rows.map((r, i) => ({
                        ...r,
                        productName: productName,
                        order: i,
                    })),
                }),
            });
            if (res.ok) {
                showToast('저장되었습니다.', 'success');
                onSaved?.();
            } else {
                showToast('저장에 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('저장 실패:', error);
            showToast('저장 중 오류가 발생했습니다.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleExcelUpload = async (file: File | null) => {
        if (!file) return;
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
            showToast('.xlsx 또는 .xls 파일만 업로드할 수 있습니다.', 'error');
            if (excelInputRef.current) excelInputRef.current.value = '';
            return;
        }

        setPendingExcelFile(file);
    };

    const uploadExcelFile = async (file: File, writePolicy: 'append' | 'replace') => {
        setIsUploadingExcel(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('action', 'apply');
            formData.append('writePolicy', writePolicy);
            formData.append('sheetNames', '제품속성표');

            const res = await fetch(`/api/projects/${projectId}/import`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                const available = data?.availableSheets?.length
                    ? ` 사용 가능한 시트: ${data.availableSheets.join(', ')}`
                    : '';
                throw new Error(`${data?.error || '제품속성표 엑셀 업로드에 실패했습니다.'}${available}`);
            }

            const importedCount = data?.appliedCounts?.productAttributes ?? data?.counts?.productAttributes ?? 0;
            await loadData();
            showToast(`제품속성표 ${importedCount}개 항목을 엑셀에서 반영했습니다.`, 'success');
        } catch (error) {
            console.error('제품속성표 엑셀 업로드 실패:', error);
            showToast(error instanceof Error ? error.message : '제품속성표 엑셀 업로드에 실패했습니다.', 'error');
        } finally {
            setIsUploadingExcel(false);
            setPendingExcelFile(null);
            if (excelInputRef.current) excelInputRef.current.value = '';
        }
    };

    const handleReset = async () => {
        try {
            await fetch(`/api/projects/${projectId}/attributes`, { method: 'DELETE' });
            setRows([]);
            setShowResetConfirm(false);
            showToast('초기화되었습니다.', 'success');
        } catch (error) {
            console.error('리셋 실패:', error);
            showToast('초기화 중 오류가 발생했습니다.', 'error');
        }
    };

    const getUniqueValues = (field: 'marketSegment' | 'customerName' | 'customerNeed' | 'benefit' | 'attribute' | 'techCapability') => {
        return [...new Set(rows.map(r => r[field]).filter(Boolean))];
    };

    const getMarketSegmentRowSpan = (index: number) => {
        return getMarketSegmentSpan(rows, index);
    };

    const getCustomerNameRowSpan = (index: number) => {
        return getCustomerNameSpan(rows, index);
    };

    const updateMarketSegmentGroup = (startIndex: number, value: string) => {
        const span = getMarketSegmentRowSpan(startIndex);
        const targetIds = new Set(rows.slice(startIndex, startIndex + span).map(r => r.id));
        setRows(rows.map(r => targetIds.has(r.id) ? { ...r, marketSegment: value } : r));
    };

    const updateCustomerNameGroup = (startIndex: number, value: string) => {
        const span = getCustomerNameRowSpan(startIndex);
        const targetIds = new Set(rows.slice(startIndex, startIndex + span).map(r => r.id));
        setRows(rows.map(r => targetIds.has(r.id) ? { ...r, customerName: value } : r));
    };

    // 선택한 스펙 항목에 연결된 기술역량 자동 조회
    const findRelatedTech = (specName: string, pickedTechnology = ''): string =>
        resolveRelatedTechnology(specFunctions, specName, pickedTechnology);

    const applySpecPick = (value: string, pickedTechnology = '', options: { autoFillTech?: boolean } = {}) => {
        if (!showSpecPicker) return;
        const { rowId, field } = showSpecPicker;
        if (field === 'techCapability') {
            setRows(prev => prev.map(r => r.id === rowId ? {
                ...r,
                techCapability: pickedTechnology || value,
            } : r));
            setImportedFields(prev => {
                const next = new Set(prev);
                next.add(`${rowId}_techCapability`);
                return next;
            });
            setShowSpecPicker(null);
            return;
        }

        const relatedTech = options.autoFillTech === false ? '' : findRelatedTech(value, pickedTechnology);
        setRows(prev => prev.map(r => r.id === rowId ? {
            ...r,
            attribute: value,
            ...(relatedTech ? { techCapability: relatedTech } : {}),
        } : r));
        setImportedFields(prev => {
            const next = new Set(prev);
            next.add(`${rowId}_attribute`);
            if (relatedTech) next.add(`${rowId}_techCapability`);
            return next;
        });
        if (relatedTech) {
            showToast(`기술역량 자동 입력: ${relatedTech}`, 'success');
        }
        setShowSpecPicker(null);
    };

    const handleManualInput = (rowId: string, field: 'attribute' | 'techCapability', value: string) => {
        if (field === 'attribute') {
            const relatedTech = findRelatedTech(value);
            setRows(rows.map(r => r.id === rowId ? {
                ...r,
                attribute: value,
                ...(relatedTech && !r.techCapability.trim() ? { techCapability: relatedTech } : {}),
            } : r));
            setImportedFields(prev => {
                const next = new Set(prev);
                next.delete(`${rowId}_attribute`);
                if (relatedTech) next.add(`${rowId}_techCapability`);
                return next;
            });
            return;
        }

        updateRow(rowId, field, value);
        setImportedFields(prev => {
            const next = new Set(prev);
            next.delete(`${rowId}_${field}`);
            return next;
        });
    };

    const isImported = (rowId: string, field: string) => importedFields.has(`${rowId}_${field}`);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-16">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-gray-400 text-sm">데이터 로딩 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 relative">
            {/* 인라인 토스트 */}
            {toast && (
                <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border animate-fade-in transition-all duration-300 ${toast.type === 'success'
                    ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200'
                    : 'bg-red-900/90 border-red-500/40 text-red-200'
                    }`}>
                    {toast.type === 'success' ? (
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    )}
                    <span className="text-sm font-medium">{toast.message}</span>
                </div>
            )}

            {/* 헤더 + 컨트롤 */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">[WS-3] 제품속성서</h2>
                    <p className="text-sm text-gray-500 mt-1">세분시장별로 여러 고객명, 고객 니즈, 제공혜택, 제품속성, 기술역량을 행 단위로 정의합니다</p>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href={templateDownloadUrl}
                        className="btn-secondary text-sm flex items-center gap-1.5"
                        title="제품속성표가 포함된 업로드 양식을 다운로드합니다."
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                        </svg>
                        양식 다운로드
                    </a>
                    <input
                        ref={excelInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(event) => handleExcelUpload(event.target.files?.[0] ?? null)}
                        className="hidden"
                        id={`attributes-excel-upload-${projectId}`}
                    />
                    <label
                        htmlFor={`attributes-excel-upload-${projectId}`}
                        className={`btn-secondary text-sm flex items-center gap-1.5 ${isSaving || isUploadingExcel ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
                        title="엑셀 파일의 제품속성표 시트를 현재 표에 반영합니다."
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        {isUploadingExcel ? '업로드 중...' : '엑셀 업로드'}
                    </label>
                    <button onClick={addRow} className="btn-secondary text-sm flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        행 추가
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                    <button onClick={() => setShowResetConfirm(true)} className="btn-ghost text-sm text-rose-400 hover:text-rose-300 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        리셋
                    </button>
                </div>
            </div>

            {pendingExcelFile && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-emerald-100">엑셀 양식 업로드</h3>
                            <p className="mt-1 text-xs text-emerald-200/70">
                                {pendingExcelFile.name} 파일을 제품속성표로 반영할 방식을 선택하세요.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => uploadExcelFile(pendingExcelFile, 'append')}
                                disabled={isUploadingExcel}
                                className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {isUploadingExcel ? '업로드 중...' : '기존 데이터에 추가'}
                            </button>
                            <button
                                type="button"
                                onClick={() => uploadExcelFile(pendingExcelFile, 'replace')}
                                disabled={isUploadingExcel}
                                className="px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                기존 데이터 지우고 업로드
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setPendingExcelFile(null);
                                    if (excelInputRef.current) excelInputRef.current.value = '';
                                }}
                                disabled={isUploadingExcel}
                                className="px-3 py-1.5 text-sm text-gray-300 hover:text-white disabled:opacity-50"
                            >
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 리셋 확인 배너 */}
            {showResetConfirm && (
                <div className="card border-rose-500/25 bg-rose-500/[0.04] animate-fade-in">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-rose-500/15 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <div>
                                <p className="text-white text-sm font-semibold">제품속성서 초기화</p>
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

            {/* 제품명 */}
            <div className="card py-3 px-4">
                <div className="flex items-center gap-4">
                    <span className="text-white font-semibold text-sm whitespace-nowrap flex items-center gap-2">
                        <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        제품명
                    </span>
                    <input
                        type="text"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        className="input flex-1 py-2 text-sm"
                        placeholder="프로젝트명에서 자동으로 가져옵니다 (수정 가능)"
                    />
                    <span className="text-xs text-gray-600 whitespace-nowrap">프로젝트명에서 자동 설정</span>
                </div>
            </div>

            {/* 테이블 */}
            {rows.length === 0 ? (
                <div className="card text-center py-16 animate-fade-in">
                    <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-display font-semibold text-gray-300 mb-2">데이터가 없습니다</h3>
                    <p className="text-sm text-gray-500 mb-6">우상단의 &apos;행 추가&apos; 버튼을 눌러 입력을 시작하세요</p>
                    <button onClick={addRow} className="btn-primary inline-flex items-center gap-2 mx-auto">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        첫 번째 행 추가
                    </button>
                </div>
            ) : (
                <div className="card p-0 overflow-x-auto">
                    <table className="w-full border-collapse text-sm table-fixed">
                        <thead>
                            <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                                <th className="px-3 py-3 text-gray-500 font-medium text-center text-xs w-[44px]">No</th>
                                <th className="px-3 py-3 text-gray-400 font-medium text-left text-xs min-w-[110px]">세분시장</th>
                                <th className="px-3 py-3 text-gray-400 font-medium text-left text-xs min-w-[110px]">고객명</th>
                                <th className="px-3 py-3 text-gray-400 font-medium text-left text-xs min-w-[150px]">고객 니즈</th>
                                <th className="px-3 py-3 text-gray-400 font-medium text-left text-xs min-w-[150px]">제공혜택</th>
                                <th className="px-3 py-3 text-left text-xs min-w-[170px]">
                                    <div className="text-cyan-400 font-semibold">제품속성</div>
                                    <div className="text-[10px] text-gray-600 font-normal mt-0.5">📥 스펙에서 가져오기</div>
                                </th>
                                <th className="px-3 py-3 text-left text-xs min-w-[170px]">
                                    <div className="text-amber-400 font-semibold">기술 역량</div>
                                    <div className="text-[10px] text-gray-600 font-normal mt-0.5">직접 입력 또는 스펙에서 선택</div>
                                </th>
                                <th className="px-3 py-3 text-gray-600 font-medium text-center text-xs w-[72px]"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, idx) => {
                                const marketSegmentRowSpan = getMarketSegmentRowSpan(idx);
                                const customerNameRowSpan = getCustomerNameRowSpan(idx);

                                return (
                                <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] group transition-colors">
                                    {/* No */}
                                    <td className="px-3 py-2 text-center text-gray-600 text-xs select-none">{idx + 1}</td>

                                    {/* 세분시장 */}
                                    {marketSegmentRowSpan > 0 && (
                                        <td rowSpan={marketSegmentRowSpan} className="p-0 align-top bg-white/[0.015] border-r border-white/[0.04]">
                                            <div className="flex h-full min-h-[44px] flex-col">
                                                <input
                                                    type="text"
                                                    list={`ms_list_${row.id}`}
                                                    value={row.marketSegment}
                                                    onChange={(e) => updateMarketSegmentGroup(idx, e.target.value)}
                                                    className="w-full px-3 py-2.5 bg-transparent text-white text-sm outline-none focus:bg-white/[0.04] focus:ring-1 focus:ring-inset focus:ring-primary-500/30 transition-colors"
                                                    placeholder="입력"
                                                />
                                                <div className="flex items-center justify-between gap-2 px-3 pb-2">
                                                    <span className="text-[10px] text-gray-600 whitespace-nowrap">
                                                        {marketSegmentRowSpan > 1 ? `${marketSegmentRowSpan}개 항목` : '1개 항목'}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => addSegmentItem(row)}
                                                        className="rounded-md border border-primary-500/20 px-2 py-1 text-[10px] text-primary-300 hover:bg-primary-500/10 transition-colors whitespace-nowrap"
                                                        title="같은 세분시장 항목 추가"
                                                    >
                                                        + 항목
                                                    </button>
                                                </div>
                                                <datalist id={`ms_list_${row.id}`}>
                                                    {getUniqueValues('marketSegment').map((v, i) => <option key={i} value={v} />)}
                                                </datalist>
                                            </div>
                                        </td>
                                    )}
                                    {/* 고객명 */}
                                    {customerNameRowSpan > 0 && (
                                        <td rowSpan={customerNameRowSpan} className="p-0 align-top bg-white/[0.01] border-r border-white/[0.04]">
                                            <div className="flex h-full min-h-[44px] flex-col">
                                                <input
                                                    type="text"
                                                    list={`customer_name_list_${row.id}`}
                                                    value={row.customerName}
                                                    onChange={(e) => updateCustomerNameGroup(idx, e.target.value)}
                                                    className="w-full px-3 py-2.5 bg-transparent text-white text-sm outline-none focus:bg-white/[0.04] focus:ring-1 focus:ring-inset focus:ring-primary-500/30 transition-colors"
                                                    placeholder="입력"
                                                />
                                                <datalist id={`customer_name_list_${row.id}`}>
                                                    {getUniqueValues('customerName').map((v, i) => <option key={i} value={v} />)}
                                                </datalist>
                                                <div className="flex items-center justify-between gap-2 px-3 pb-2">
                                                    <span className="text-[10px] text-gray-600 whitespace-nowrap">
                                                        {customerNameRowSpan > 1 ? `${customerNameRowSpan}개 니즈` : '1개 니즈'}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => addCustomerNeedItem(row)}
                                                        className="rounded-md border border-cyan-500/20 px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-500/10 transition-colors whitespace-nowrap"
                                                        title="같은 고객명에 고객니즈 추가"
                                                    >
                                                        + 니즈
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    )}

                                    {/* 고객 니즈 */}
                                    <td className="p-0">
                                        <input
                                            type="text"
                                            list={`cn_list_${row.id}`}
                                            value={row.customerNeed}
                                            onChange={(e) => updateRow(row.id, 'customerNeed', e.target.value)}
                                            className="w-full h-full px-3 py-2.5 bg-transparent text-white text-sm outline-none focus:bg-white/[0.04] focus:ring-1 focus:ring-inset focus:ring-primary-500/30 transition-colors"
                                            placeholder="입력"
                                        />
                                        <datalist id={`cn_list_${row.id}`}>
                                            {getUniqueValues('customerNeed').map((v, i) => <option key={i} value={v} />)}
                                        </datalist>
                                    </td>

                                    {/* 제공혜택 */}
                                    <td className="p-0">
                                        <input
                                            type="text"
                                            list={`bn_list_${row.id}`}
                                            value={row.benefit}
                                            onChange={(e) => updateRow(row.id, 'benefit', e.target.value)}
                                            className="w-full h-full px-3 py-2.5 bg-transparent text-white text-sm outline-none focus:bg-white/[0.04] focus:ring-1 focus:ring-inset focus:ring-primary-500/30 transition-colors"
                                            placeholder="입력"
                                        />
                                        <datalist id={`bn_list_${row.id}`}>
                                            {getUniqueValues('benefit').map((v, i) => <option key={i} value={v} />)}
                                        </datalist>
                                    </td>

                                    {/* 제품속성 */}
                                    <td className="p-0 bg-cyan-500/[0.04] relative">
                                        <input
                                            type="text"
                                            list={`attribute_list_${row.id}`}
                                            value={row.attribute}
                                            onChange={(e) => handleManualInput(row.id, 'attribute', e.target.value)}
                                            className={`w-full px-3 pr-8 py-2.5 bg-transparent text-sm outline-none focus:bg-cyan-500/[0.08] focus:ring-1 focus:ring-inset focus:ring-cyan-500/30 transition-colors ${isImported(row.id, 'attribute') ? 'text-cyan-300' : 'text-gray-300'}`}
                                            placeholder="입력"
                                        />
                                        <datalist id={`attribute_list_${row.id}`}>
                                            {getUniqueValues('attribute').map((v, i) => <option key={i} value={v} />)}
                                        </datalist>
                                        <button
                                            type="button"
                                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowSpecPicker({ rowId: row.id, field: 'attribute' }); }}
                                            className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-cyan-500 hover:text-cyan-300 hover:bg-cyan-500/20 rounded transition-colors cursor-pointer z-10"
                                            title="AS-IS 스펙에서 가져오기"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                        </button>
                                    </td>

                                    {/* 기술 역량 */}
                                    <td className="p-0 bg-amber-500/[0.04] relative">
                                        <input
                                            type="text"
                                            list={`tech_capability_list_${row.id}`}
                                            value={row.techCapability}
                                            onChange={(e) => handleManualInput(row.id, 'techCapability', e.target.value)}
                                            className={`w-full px-3 pr-8 py-2.5 bg-transparent text-sm outline-none focus:bg-amber-500/[0.08] focus:ring-1 focus:ring-inset focus:ring-amber-500/30 transition-colors ${isImported(row.id, 'techCapability') ? 'text-amber-300' : 'text-gray-300'}`}
                                            placeholder="입력"
                                        />
                                        <datalist id={`tech_capability_list_${row.id}`}>
                                            {getUniqueValues('techCapability').map((v, i) => <option key={i} value={v} />)}
                                        </datalist>
                                        <button
                                            type="button"
                                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowSpecPicker({ rowId: row.id, field: 'techCapability' }); }}
                                            className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-amber-500 hover:text-amber-300 hover:bg-amber-500/20 rounded transition-colors cursor-pointer z-10"
                                            title="AS-IS 스펙에서 기술역량 선택"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                        </button>
                                    </td>

                                    {/* 삭제 */}
                                    <td className="px-2 py-2 text-center">
                                        <button
                                            onClick={() => addSegmentItem(row)}
                                            className="p-1.5 rounded-lg text-transparent group-hover:text-primary-400 hover:bg-primary-500/10 transition-all"
                                            title="같은 세분시장 항목 추가"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => deleteRow(row.id)}
                                            className="p-1.5 rounded-lg text-transparent group-hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                                            title="행 삭제"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {/* 테이블 하단 - 빠른 行 추가 */}
                    <button
                        onClick={addRow}
                        className="w-full py-3 text-gray-600 hover:text-gray-400 hover:bg-white/[0.02] transition-colors text-sm flex items-center justify-center gap-2 border-t border-white/[0.04]"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        행 추가
                    </button>
                </div>
            )}

            {/* AS-IS 스펙 선택 모달 - 엑셀 워크시트 표 형식 */}
            {showSpecPicker && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="glass-strong max-w-4xl w-full max-h-[82vh] overflow-hidden flex flex-col rounded-2xl border border-white/[0.1]">

                        {/* 모달 헤더 */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] flex-shrink-0 bg-white/[0.02]">
                            <div>
                                <h3 className="text-base font-display font-bold text-white flex items-center gap-2">
                                    <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    AS-IS 스펙표에서 가져오기
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {showSpecPicker.field === 'attribute'
                                        ? '세세부기능 행을 클릭하면 적용기술이 함께 입력되고, 세부기능 셀을 클릭하면 제품속성만 입력됩니다'
                                        : '행을 클릭하면 기술역량 칸에 적용기술이 입력됩니다'}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowSpecPicker(null)}
                                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* 모달 본문 - 엑셀 워크시트 표 형식 */}
                        <div className="overflow-auto flex-1">
                            {specFunctions.length === 0 ? (
                                <div className="text-center py-16 text-gray-400">
                                    <div className="text-4xl mb-3">📭</div>
                                    <p className="mb-2 text-sm">AS-IS 스펙이 아직 없습니다</p>
                                    <p className="text-xs text-gray-600">AS-IS 스펙 탭에서 먼저 기능을 입력해주세요</p>
                                </div>
                            ) : (
                                <SpecSheetTable
                                    specFunctions={specFunctions}
                                    field={showSpecPicker.field}
                                    onPick={applySpecPick}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
