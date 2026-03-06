'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

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
}

interface ProductAttributesTableProps {
    projectId: string;
}

type ToastType = 'success' | 'error';

export default function ProductAttributesTable({ projectId }: ProductAttributesTableProps) {
    const [rows, setRows] = useState<ProductAttributeRow[]>([]);
    const [specFunctions, setSpecFunctions] = useState<SpecFunction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showSpecPicker, setShowSpecPicker] = useState<{ rowId: string; field: 'attribute' | 'techCapability' } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [productName, setProductName] = useState('');
    const [importedFields, setImportedFields] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        loadData();
    }, [projectId]);

    const showToast = (message: string, type: ToastType = 'success') => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ message, type });
        toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    };

    const loadData = async () => {
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
                if (found && !productName) {
                    setProductName(found.name || '');
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
    };

    const addRow = () => {
        const newRow: ProductAttributeRow = {
            id: `attr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            productName: '',
            customerName: '',
            marketSegment: '',
            customerNeed: '',
            benefit: '',
            attribute: '',
            techCapability: '',
            order: rows.length,
        };
        setRows([...rows, newRow]);
    };

    const updateRow = (id: string, field: keyof ProductAttributeRow, value: string) => {
        setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const deleteRow = (id: string) => {
        setRows(rows.filter(r => r.id !== id));
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

    const getSubFunctions = () => specFunctions.filter(f => f.level === 'SUB' || f.level === 'DETAIL');
    const getCoreFunctions = () => specFunctions.filter(f => f.level === 'CORE');

    const getTechCapabilities = () => {
        return specFunctions
            .filter(f => f.technology && f.technology.trim())
            .map(f => ({ name: f.name, tech: f.technology! }));
    };

    // 선택한 스펙 항목에 연결된 기술역량 자동 조회
    const findRelatedTech = (specName: string): string => {
        // 선택된 이름과 일치하는 스펙 항목 찾기
        const matched = specFunctions.find(f => f.name === specName);
        if (!matched) return '';

        // DETAIL 레벨: technology 직접 사용
        if (matched.level === 'DETAIL' && matched.technology) {
            return matched.technology.trim();
        }

        // SUB 레벨: 해당 SUB의 DETAIL 자식들의 technology 수집
        if (matched.level === 'SUB') {
            const childDetails = specFunctions.filter(
                f => f.level === 'DETAIL' && f.parentId === matched.id && f.technology
            );
            if (childDetails.length > 0) {
                return [...new Set(childDetails.map(d => d.technology!.trim()))].join(', ');
            }
        }

        // CORE 레벨: 하위 DETAIL들의 technology 수집
        if (matched.level === 'CORE') {
            const subIds = specFunctions
                .filter(f => f.level === 'SUB' && f.parentId === matched.id)
                .map(f => f.id);
            const childDetails = specFunctions.filter(
                f => f.level === 'DETAIL' && subIds.includes(f.parentId ?? '') && f.technology
            );
            if (childDetails.length > 0) {
                return [...new Set(childDetails.map(d => d.technology!.trim()))].join(', ');
            }
        }

        return '';
    };

    const applySpecPick = (value: string) => {
        if (!showSpecPicker) return;

        const { rowId, field } = showSpecPicker;

        if (field === 'attribute') {
            // 제품속성과 기술역량을 단일 setRows 호출로 동시에 업데이트
            // (두 번의 updateRow 호출은 React 배칭으로 인해 마지막 것만 반영됨)
            const relatedTech = findRelatedTech(value);
            const currentRow = rows.find(r => r.id === rowId);
            const shouldAutoFill = !!relatedTech && !currentRow?.techCapability?.trim();

            setRows(prev => prev.map(r => r.id === rowId ? {
                ...r,
                attribute: value,
                ...(shouldAutoFill ? { techCapability: relatedTech } : {}),
            } : r));

            setImportedFields(prev => {
                const next = new Set(prev);
                next.add(`${rowId}_attribute`);
                if (shouldAutoFill) next.add(`${rowId}_techCapability`);
                return next;
            });

            if (shouldAutoFill) {
                showToast(`기술역량 자동 입력: ${relatedTech}`, 'success');
            }
        } else {
            updateRow(rowId, field, value);
            setImportedFields(prev => {
                const next = new Set(prev);
                next.add(`${rowId}_${field}`);
                return next;
            });
        }

        setShowSpecPicker(null);
    };


    const handleManualInput = (rowId: string, field: 'attribute' | 'techCapability', value: string) => {
        updateRow(rowId, field, value);
        setImportedFields(prev => {
            const next = new Set(prev);
            next.delete(`${rowId}_${field}`);
            return next;
        });
    };

    const isImported = (rowId: string, field: string) => importedFields.has(`${rowId}_${field}`);

    const getUniqueValues = (field: 'marketSegment' | 'customerNeed' | 'benefit') => {
        return [...new Set(rows.map(r => r[field]).filter(Boolean))];
    };

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
                    <h2 className="text-xl font-display font-bold text-white">제품속성서</h2>
                    <p className="text-sm text-gray-500 mt-1">세분시장별 고객 니즈, 제공혜택, 제품속성, 기술역량을 정의합니다</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={addRow}
                        className="btn-secondary text-sm flex items-center gap-1.5"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        행 추가
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                    <button
                        onClick={() => setShowResetConfirm(true)}
                        className="btn-ghost text-sm text-rose-400 hover:text-rose-300 flex items-center gap-1.5"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        리셋
                    </button>
                </div>
            </div>

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
                    <p className="text-sm text-gray-500 mb-6">우상단의 '행 추가' 버튼을 눌러 입력을 시작하세요</p>
                    <button
                        onClick={addRow}
                        className="btn-primary inline-flex items-center gap-2 mx-auto"
                    >
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
                                <th className="px-3 py-3 text-gray-400 font-medium text-left text-xs min-w-[110px]">고객명</th>
                                <th className="px-3 py-3 text-gray-400 font-medium text-left text-xs min-w-[110px]">세분시장</th>
                                <th className="px-3 py-3 text-gray-400 font-medium text-left text-xs min-w-[150px]">고객 니즈</th>
                                <th className="px-3 py-3 text-gray-400 font-medium text-left text-xs min-w-[150px]">제공혜택</th>
                                <th className="px-3 py-3 text-left text-xs min-w-[170px]">
                                    <div className="text-cyan-400 font-semibold">제품속성</div>
                                    <div className="text-[10px] text-gray-600 font-normal mt-0.5">📥 스펙에서 가져오기</div>
                                </th>
                                <th className="px-3 py-3 text-left text-xs min-w-[170px]">
                                    <div className="text-amber-400 font-semibold">기술 역량</div>
                                    <div className="text-[10px] text-gray-600 font-normal mt-0.5">📥 스펙에서 가져오기</div>
                                </th>
                                <th className="px-3 py-3 text-gray-600 font-medium text-center text-xs w-[40px]"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, idx) => (
                                <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] group transition-colors">
                                    {/* No */}
                                    <td className="px-3 py-2 text-center text-gray-600 text-xs select-none">{idx + 1}</td>

                                    {/* 고객명 */}
                                    <td className="p-0">
                                        <input
                                            type="text"
                                            value={row.customerName}
                                            onChange={(e) => updateRow(row.id, 'customerName', e.target.value)}
                                            className="w-full h-full px-3 py-2.5 bg-transparent text-white text-sm outline-none focus:bg-white/[0.04] focus:ring-1 focus:ring-inset focus:ring-primary-500/30 transition-colors"
                                            placeholder="입력"
                                        />
                                    </td>

                                    {/* 세분시장 */}
                                    <td className="p-0">
                                        <input
                                            type="text"
                                            list={`ms_list_${row.id}`}
                                            value={row.marketSegment}
                                            onChange={(e) => updateRow(row.id, 'marketSegment', e.target.value)}
                                            className="w-full h-full px-3 py-2.5 bg-transparent text-white text-sm outline-none focus:bg-white/[0.04] focus:ring-1 focus:ring-inset focus:ring-primary-500/30 transition-colors"
                                            placeholder="입력"
                                        />
                                        <datalist id={`ms_list_${row.id}`}>
                                            {getUniqueValues('marketSegment').map((v, i) => <option key={i} value={v} />)}
                                        </datalist>
                                    </td>

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
                                            value={row.attribute}
                                            onChange={(e) => handleManualInput(row.id, 'attribute', e.target.value)}
                                            className={`w-full px-3 pr-8 py-2.5 bg-transparent text-sm outline-none focus:bg-cyan-500/[0.08] focus:ring-1 focus:ring-inset focus:ring-cyan-500/30 transition-colors ${isImported(row.id, 'attribute') ? 'text-cyan-300' : 'text-gray-300'}`}
                                            placeholder="입력"
                                        />
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
                                            value={row.techCapability}
                                            onChange={(e) => handleManualInput(row.id, 'techCapability', e.target.value)}
                                            className={`w-full px-3 pr-8 py-2.5 bg-transparent text-sm outline-none focus:bg-amber-500/[0.08] focus:ring-1 focus:ring-inset focus:ring-amber-500/30 transition-colors ${isImported(row.id, 'techCapability') ? 'text-amber-300' : 'text-gray-300'}`}
                                            placeholder="입력"
                                        />
                                        <button
                                            type="button"
                                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowSpecPicker({ rowId: row.id, field: 'techCapability' }); }}
                                            className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-amber-500 hover:text-amber-300 hover:bg-amber-500/20 rounded transition-colors cursor-pointer z-10"
                                            title="AS-IS 스펙에서 가져오기"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                        </button>
                                    </td>

                                    {/* 삭제 */}
                                    <td className="px-2 py-2 text-center">
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
                            ))}
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

            {/* AS-IS 스펙 선택 모달 */}
            {showSpecPicker && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="glass-strong max-w-lg w-full max-h-[70vh] overflow-hidden flex flex-col p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
                                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                {showSpecPicker.field === 'attribute' ? 'AS-IS 스펙 → 제품속성 선택' : 'AS-IS 스펙 → 기술역량 선택'}
                            </h3>
                            <button
                                onClick={() => setShowSpecPicker(null)}
                                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 space-y-1.5">
                            {specFunctions.length === 0 ? (
                                <div className="text-center py-10 text-gray-400">
                                    <div className="text-4xl mb-3">📭</div>
                                    <p className="mb-2 text-sm">AS-IS 스펙이 아직 없습니다</p>
                                    <Link href={`/project/${projectId}/spec`} className="text-primary-400 hover:text-primary-300 text-sm">
                                        AS-IS 스펙표 작성하기 →
                                    </Link>
                                </div>
                            ) : showSpecPicker.field === 'attribute' ? (
                                <>
                                    <p className="text-xs text-gray-500 mb-2 px-1">세부 기능을 제품속성으로 가져옵니다</p>
                                    {getSubFunctions().map(f => (
                                        <button
                                            key={f.id}
                                            onClick={() => applySpecPick(f.name)}
                                            className="w-full text-left px-4 py-3 bg-white/[0.03] hover:bg-cyan-500/[0.08] border border-white/[0.06] hover:border-cyan-500/30 rounded-xl transition-colors text-sm"
                                        >
                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] mr-2 ${f.level === 'SUB' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}`}>
                                                {f.level === 'SUB' ? '세부' : '상세'}
                                            </span>
                                            <span className="text-cyan-300">{f.name}</span>
                                        </button>
                                    ))}
                                    {getSubFunctions().length === 0 && (
                                        <p className="text-sm text-gray-500 text-center py-4">세부/상세 기능이 없습니다.</p>
                                    )}
                                    {getCoreFunctions().length > 0 && (
                                        <>
                                            <div className="border-t border-white/[0.06] my-3 pt-2">
                                                <p className="text-xs text-gray-500 px-1">핵심 기능</p>
                                            </div>
                                            {getCoreFunctions().map(f => (
                                                <button
                                                    key={f.id}
                                                    onClick={() => applySpecPick(f.name)}
                                                    className="w-full text-left px-4 py-3 bg-white/[0.02] hover:bg-cyan-500/[0.06] border border-white/[0.04] hover:border-cyan-500/25 rounded-xl transition-colors text-sm"
                                                >
                                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] mr-2 bg-emerald-500/20 text-emerald-300">핵심</span>
                                                    <span className="text-cyan-300">{f.name}</span>
                                                </button>
                                            ))}
                                        </>
                                    )}
                                </>
                            ) : (
                                <>
                                    <p className="text-xs text-gray-500 mb-2 px-1">AS-IS 스펙의 기술적 특성을 기술역량으로 가져옵니다</p>
                                    {getTechCapabilities().length > 0 ? (
                                        getTechCapabilities().map((item, i) => (
                                            <button
                                                key={i}
                                                onClick={() => applySpecPick(item.tech)}
                                                className="w-full text-left px-4 py-3 bg-white/[0.03] hover:bg-amber-500/[0.08] border border-white/[0.06] hover:border-amber-500/30 rounded-xl transition-colors text-sm"
                                            >
                                                <span className="text-gray-500 text-xs">{item.name} → </span>
                                                <span className="text-amber-300">{item.tech}</span>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="text-center py-6 text-gray-400">
                                            <p className="text-sm mb-1">기술적 특성 데이터가 없습니다</p>
                                            <p className="text-xs text-gray-600">AS-IS 스펙표에서 '기술적 특성' 컬럼을 입력하세요</p>
                                        </div>
                                    )}
                                    <div className="border-t border-white/[0.06] my-3 pt-2">
                                        <p className="text-xs text-gray-500 px-1">스펙 기능 직접 사용</p>
                                    </div>
                                    {specFunctions.map(f => (
                                        <button
                                            key={f.id}
                                            onClick={() => applySpecPick(f.name)}
                                            className="w-full text-left px-4 py-3 bg-white/[0.02] hover:bg-amber-500/[0.06] border border-white/[0.04] hover:border-amber-500/25 rounded-xl transition-colors text-sm"
                                        >
                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] mr-2 ${f.level === 'CORE' ? 'bg-emerald-500/20 text-emerald-300' : f.level === 'SUB' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}`}>
                                                {f.level === 'CORE' ? '핵심' : f.level === 'SUB' ? '세부' : '상세'}
                                            </span>
                                            <span className="text-amber-300">{f.name}</span>
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
