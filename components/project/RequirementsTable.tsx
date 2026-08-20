'use client';

import { useCallback, useEffect, useRef, useState, KeyboardEvent } from 'react';
import Link from 'next/link';
import {
    shouldShowPrimaryGroup,
    shouldShowSecondaryGroup,
    sortRequirementsByWorksheetOrder,
} from '@/lib/requirements-table-utils';

interface Requirement {
    id: string;
    category: string;
    subcategory: string;
    requirement: string;
    order: number;
}

interface RequirementsTableProps {
    projectId: string;
}

type ToastType = 'success' | 'error';

// 카테고리별 색상 팔레트 (최대 10개 순환)
const CATEGORY_COLORS = [
    { bg: 'bg-blue-500/15', text: 'text-blue-300', border: 'border-blue-500/25' },
    { bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/25' },
    { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/25' },
    { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/25' },
    { bg: 'bg-pink-500/15', text: 'text-pink-300', border: 'border-pink-500/25' },
    { bg: 'bg-cyan-500/15', text: 'text-cyan-300', border: 'border-cyan-500/25' },
    { bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/25' },
    { bg: 'bg-teal-500/15', text: 'text-teal-300', border: 'border-teal-500/25' },
    { bg: 'bg-rose-500/15', text: 'text-rose-300', border: 'border-rose-500/25' },
    { bg: 'bg-indigo-500/15', text: 'text-indigo-300', border: 'border-indigo-500/25' },
];

function useCategoryColor(categories: string[]) {
    const map: Record<string, (typeof CATEGORY_COLORS)[0]> = {};
    categories.forEach((cat, i) => {
        map[cat] = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
    });
    return map;
}

export default function RequirementsTable({ projectId }: RequirementsTableProps) {
    const templateDownloadUrl = `/api/projects/${projectId}/import/template?sheet=requirements`;
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingExcel, setIsUploadingExcel] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Partial<Requirement>>({});

    // 새 행 입력 상태
    const [newRow, setNewRow] = useState({ category: '', subcategory: '', requirement: '' });
    const [isAddingNew, setIsAddingNew] = useState(false);
    const newCatRef = useRef<HTMLInputElement>(null);

    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const excelInputRef = useRef<HTMLInputElement | null>(null);

    // 카테고리 목록 (자동완성용)
    const categoryList = [...new Set(requirements.map(r => r.category).filter(Boolean))];
    const subcategoryList = [...new Set(requirements.map(r => r.subcategory).filter(Boolean))];
    const categoryColors = useCategoryColor(categoryList);

    const showToast = (message: string, type: ToastType = 'success') => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ message, type });
        toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    };

    // AI 자동생성 (규칙 기반)
    const handleGenerateAI = async (mode: 'append' | 'overwrite') => {
        setIsLoading(true);
        try {
            // 1. 제품속성서 데이터 가져오기
            const res = await fetch(`/api/projects/${projectId}/attributes`);
            if (!res.ok) throw new Error('제품속성 데이터를 가져오지 못했습니다.');
            
            const { attributes } = await res.json();
            if (!attributes || attributes.length === 0) {
                showToast('제품속성서에 데이터가 없습니다. 먼저 제품속성을 입력해주세요.', 'error');
                return;
            }

            // 2. 규칙 기반 변환 (Mapping)
            // 향후 이 부분을 외부 AI API 호출로 교체 가능하도록 설계
            const generatedReqs = attributes.map((attr: any, idx: number) => {
                const customerNeed = attr.customerNeed?.trim() || '';
                const benefit = attr.benefit?.trim() || '';
                
                // 요구사항 문장 생성 패턴
                let reqContent = '';
                if (customerNeed && benefit) {
                    reqContent = `${customerNeed}을(를) 통해 ${benefit}을(를) 얻고자 함`;
                } else {
                    reqContent = customerNeed || benefit || '요구사항을 정의해주세요';
                }

                return {
                    id: `gen_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
                    category: attr.marketSegment?.trim() || '일반',
                    subcategory: attr.attribute?.trim() || '',
                    requirement: reqContent,
                    order: idx + 1
                };
            });

            // 3. 상태 업데이트
            if (mode === 'overwrite') {
                setRequirements(generatedReqs);
                showToast(`✨ ${generatedReqs.length}개의 요구사항으로 완전히 교체되었습니다.`);
            } else {
                // 중복 방지 (카테고리와 내용이 완전히 같은 경우 제외)
                const existingKeys = new Set(requirements.map(r => `${r.category}|${r.requirement}`));
                const filteredNew = generatedReqs.filter((r: any) => !existingKeys.has(`${r.category}|${r.requirement}`));
                
                if (filteredNew.length === 0) {
                    showToast('새로 추가할 항목이 없습니다. (이미 동일한 항목이 존재함)', 'error');
                } else {
                    setRequirements(prev => [...prev, ...filteredNew]);
                    showToast(`✨ ${filteredNew.length}개의 새로운 요구사항이 추가되었습니다.`);
                }
            }
        } catch (error) {
            console.error('AI 생성 오류:', error);
            showToast('데이터 생성 중 오류가 발생했습니다.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const loadRequirements = useCallback(async () => {
        try {
            const res = await fetch(`/api/projects/${projectId}/requirements`);
            if (res.ok) {
                const data = await res.json();
                // 엑셀 업로드로 들어온 행은 2차 분류가 비어 있으면 null 이므로 빈 문자열로 맞춰 둔다.
                setRequirements((data.requirements || []).map((row: Partial<Requirement>) => ({
                    id: row.id ?? '',
                    category: row.category ?? '',
                    subcategory: row.subcategory ?? '',
                    requirement: row.requirement ?? '',
                    order: row.order ?? 0,
                })));
            }
        } catch (e) {
            console.error('요구사항 로딩 실패:', e);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadRequirements();
    }, [loadRequirements]);

    const handleSave = async (options: { confirmCascade?: boolean } = {}) => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/requirements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requirements,
                    ...(options.confirmCascade ? { confirmCascade: true } : {}),
                }),
            });
            const data = await res.json().catch(() => null);

            // id 없는 행만 남아 전체 삭제로 이어지면 서버가 409 로 막는다.
            // 무엇이 함께 지워지는지 보여주고 한 번 더 확인받는다.
            if (res.status === 409 && data?.needsCascadeConfirm) {
                if (window.confirm(`${data.error}\n\n그래도 계속하시겠습니까?`)) {
                    await handleSave({ confirmCascade: true });
                    return;
                }
                showToast('저장을 취소했습니다.', 'error');
                return;
            }

            if (res.ok) {
                showToast('저장되었습니다.', 'success');
                setEditingId(null);
                setEditValues({});
            } else {
                showToast('저장에 실패했습니다.', 'error');
            }
        } catch {
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
            return;
        }

        const uploadPolicy = window.prompt('업로드 방식을 선택하세요.\n\n1: 기존 데이터에 추가\n2: 기존 데이터를 지우고 새롭게 업로드', '1');
        if (uploadPolicy === null) return;
        const shouldReplace = uploadPolicy.trim() === '2';
        if (!shouldReplace && uploadPolicy.trim() !== '1') {
            showToast('업로드 방식은 1 또는 2로 선택해주세요.', 'error');
            return;
        }

        setIsUploadingExcel(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('action', 'apply');
            formData.append('writePolicy', shouldReplace ? 'replace' : 'append');
            formData.append('sheetNames', '고객요구사항도출표');

            const res = await fetch(`/api/projects/${projectId}/import`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                const available = data?.availableSheets?.length
                    ? ` 사용 가능한 시트: ${data.availableSheets.join(', ')}`
                    : '';
                throw new Error(`${data?.error || '고객요구사항도출표 엑셀 업로드에 실패했습니다.'}${available}`);
            }

            const importedCount = data?.appliedCounts?.customerRequirements ?? data?.counts?.customerRequirements ?? 0;
            await loadRequirements();
            showToast(`고객요구사항도출표 ${importedCount}개 항목을 엑셀에서 반영했습니다.`, 'success');
        } catch (error) {
            console.error('고객요구사항도출표 엑셀 업로드 실패:', error);
            showToast(error instanceof Error ? error.message : '고객요구사항도출표 엑셀 업로드에 실패했습니다.', 'error');
        } finally {
            setIsUploadingExcel(false);
            if (excelInputRef.current) excelInputRef.current.value = '';
        }
    };

    // 새 행 추가
    const handleAddNew = () => {
        if (!newRow.category.trim() || !newRow.requirement.trim()) {
            showToast('카테고리와 요구사항을 입력하세요.', 'error');
            return;
        }
        const newReq: Requirement = {
            id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            category: newRow.category.trim(),
            subcategory: newRow.subcategory.trim(),
            requirement: newRow.requirement.trim(),
            order: requirements.length + 1,
        };
        setRequirements(prev => [...prev, newReq]);
        setNewRow({ category: '', subcategory: '', requirement: '' });
        setIsAddingNew(false);
    };

    // 새 행 입력에서 Enter → 추가
    const handleNewRowKey = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAddNew();
        }
        if (e.key === 'Escape') {
            setIsAddingNew(false);
            setNewRow({ category: '', subcategory: '', requirement: '' });
        }
    };

    // 인라인 편집 시작
    const startEdit = (req: Requirement) => {
        setEditingId(req.id);
        setEditValues({ category: req.category, subcategory: req.subcategory, requirement: req.requirement });
    };

    // 편집 확정
    const commitEdit = (id: string) => {
        setRequirements(prev =>
            prev.map(r => r.id === id ? { ...r, ...editValues } : r)
        );
        setEditingId(null);
        setEditValues({});
    };

    // 편집 취소
    const cancelEdit = () => {
        setEditingId(null);
        setEditValues({});
    };

    const handleDelete = (id: string) => {
        setRequirements(prev => prev.filter(r => r.id !== id));
    };

    // 워크시트 행 순서를 보존한다. 1차/2차 그룹 값으로 항목 순서를 재정렬하지 않는다.
    const sorted = sortRequirementsByWorksheetOrder(requirements);

    const groupedCategories = [...new Set(sorted.map(r => r.category))];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-16">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-gray-400 text-sm">로딩 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 relative">
            {/* 토스트 */}
            {toast && (
                <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border animate-fade-in ${toast.type === 'success'
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

            {/* 헤더 */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">[WS-5] 고객 요구사항 관리</h2>
                    <p className="text-sm text-gray-500 mt-1">Kano 설문의 기반이 되는 고객 요구사항 · 항목을 클릭하면 바로 수정할 수 있습니다</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* 통계 */}
                    <div className="flex items-center gap-4 text-xs text-gray-500 mr-2">
                        <span><span className="text-white font-semibold">{requirements.length}</span>개 요구사항</span>
                        <span><span className="text-white font-semibold">{groupedCategories.length}</span>개 카테고리</span>
                    </div>

                    <a
                        href={templateDownloadUrl}
                        className="btn-secondary text-sm flex items-center gap-1.5"
                        title="고객요구사항도출표가 포함된 업로드 양식을 다운로드합니다."
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
                        id={`requirements-excel-upload-${projectId}`}
                    />
                    <label
                        htmlFor={`requirements-excel-upload-${projectId}`}
                        className={`btn-secondary text-sm flex items-center gap-1.5 ${isSaving || isUploadingExcel ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
                        title="엑셀 파일의 고객요구사항도출표 시트를 현재 표에 반영합니다."
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        {isUploadingExcel ? '업로드 중...' : '엑셀 업로드'}
                    </label>

                    {/* AI 자동생성 버튼 및 메뉴 */}
                    <div className="relative group">
                        <button
                            onClick={() => handleGenerateAI('append')}
                            disabled={isSaving}
                            className="btn-secondary text-sm flex items-center gap-1.5 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 border-indigo-500/30 text-indigo-300"
                        >
                            <span className="animate-pulse">✨</span>
                            AI 자동생성
                            <svg className="w-3.5 h-3.5 ml-0.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {/* 드롭다운 메뉴 (기존 데이터가 있을 때) */}
                        {requirements.length > 0 && (
                            <div className="absolute right-0 top-full mt-2 w-48 py-2 bg-[#1a1c1e] border border-white/[0.08] rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                                <button
                                    onClick={() => handleGenerateAI('append')}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/[0.04] hover:text-white transition-colors"
                                >
                                    기존 항목에 추가
                                </button>
                                <button
                                    onClick={() => handleGenerateAI('overwrite')}
                                    className="w-full text-left px-4 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
                                >
                                    전체 교체 (기존 삭제)
                                </button>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => {
                            setIsAddingNew(true);
                            setTimeout(() => newCatRef.current?.focus(), 50);
                        }}
                        className="btn-secondary text-sm flex items-center gap-1.5"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        행 추가
                    </button>
                    <button
                        onClick={() => handleSave()}
                        disabled={isSaving || requirements.length === 0}
                        className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                    <Link href={`/project/${projectId}/kano`} className="btn-secondary text-sm flex items-center gap-2">
                        Kano 설문으로
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                    </Link>
                </div>
            </div>

            {/* 테이블 */}
            <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-12">No</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-emerald-400">항목</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-red-400 w-44">1차 그룹</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-blue-400 w-44">2차 그룹</th>
                            <th className="px-4 py-3 w-20"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.length === 0 && !isAddingNew && (
                            <tr>
                                <td colSpan={5} className="px-4 py-16 text-center">
                                    <div className="text-4xl mb-3">📝</div>
                                    <p className="text-gray-400 text-sm mb-1">요구사항이 없습니다</p>
                                    <p className="text-gray-600 text-xs">우상단 &apos;행 추가&apos; 버튼 또는 테이블 하단 영역을 클릭하세요</p>
                                </td>
                            </tr>
                        )}

                        {(() => {
                            let no = 1;
                            return sorted.map((req, idx) => {
                                const isEditing = editingId === req.id;
                                const showCategory = shouldShowPrimaryGroup(sorted, idx);
                                const showSubcategory = shouldShowSecondaryGroup(sorted, idx);

                                return (
                                    <tr
                                        key={req.id}
                                        className={`border-b border-white/[0.04] group transition-colors ${isEditing ? 'bg-primary-500/[0.04]' : 'hover:bg-white/[0.02]'}`}
                                    >
                                        <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{no++}</td>

                                        {/* 항목 */}
                                        <td className="px-2 py-1.5">
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editValues.requirement ?? ''}
                                                    onChange={e => setEditValues(v => ({ ...v, requirement: e.target.value }))}
                                                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(req.id); if (e.key === 'Escape') cancelEdit(); }}
                                                    className="w-full px-2 py-1.5 bg-white/[0.06] border border-primary-500/30 rounded-lg text-white text-xs outline-none focus:ring-1 focus:ring-primary-500/50"
                                                    autoFocus
                                                />
                                            ) : (
                                                <span className="text-gray-200 text-sm block py-0.5">
                                                    {req.requirement}
                                                </span>
                                            )}
                                        </td>

                                        {/* 1차 그룹 */}
                                        <td className="px-2 py-1.5">
                                            {isEditing ? (
                                                <>
                                                    <input
                                                        type="text"
                                                        list="cat_autocomplete"
                                                        value={editValues.category ?? ''}
                                                        onChange={e => setEditValues(v => ({ ...v, category: e.target.value }))}
                                                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(req.id); if (e.key === 'Escape') cancelEdit(); }}
                                                        className="w-full px-2 py-1.5 bg-white/[0.06] border border-red-500/30 rounded-lg text-red-100 text-xs outline-none focus:ring-1 focus:ring-red-500/50"
                                                    />
                                                    <datalist id="cat_autocomplete">
                                                        {categoryList.map(c => <option key={c} value={c} />)}
                                                    </datalist>
                                                </>
                                            ) : (
                                                <span className="text-red-300 text-xs font-medium">
                                                    {showCategory ? (req.category || <span className="text-gray-700">—</span>) : ''}
                                                </span>
                                            )}
                                        </td>

                                        {/* 2차 그룹 */}
                                        <td className="px-2 py-1.5">
                                            {isEditing ? (
                                                <>
                                                    <input
                                                        type="text"
                                                        list="subcat_autocomplete"
                                                        value={editValues.subcategory ?? ''}
                                                        onChange={e => setEditValues(v => ({ ...v, subcategory: e.target.value }))}
                                                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(req.id); if (e.key === 'Escape') cancelEdit(); }}
                                                        placeholder="선택사항"
                                                        className="w-full px-2 py-1.5 bg-white/[0.06] border border-blue-500/30 rounded-lg text-blue-100 text-xs outline-none focus:ring-1 focus:ring-blue-500/50"
                                                    />
                                                    <datalist id="subcat_autocomplete">
                                                        {subcategoryList.map(c => <option key={c} value={c} />)}
                                                    </datalist>
                                                </>
                                            ) : (
                                                <span className="text-blue-300/80 text-xs">
                                                    {showSubcategory ? (req.subcategory || <span className="text-gray-700">—</span>) : ''}
                                                </span>
                                            )}
                                        </td>

                                        {/* 삭제 */}
                                        <td className="px-2 py-2 text-center">
                                            {isEditing ? (
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => commitEdit(req.id)}
                                                        className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                                                        title="저장"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={cancelEdit}
                                                        className="p-1.5 rounded-lg bg-white/[0.04] text-gray-500 hover:bg-white/[0.08] hover:text-white transition-colors"
                                                        title="취소"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => startEdit(req)}
                                                        className="p-1.5 rounded-lg text-gray-500 hover:text-primary-300 hover:bg-primary-500/10 transition-colors"
                                                        title="수정"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.651-1.651a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 7.125L16.875 4.5" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(req.id)}
                                                        className="p-1.5 rounded-lg text-transparent group-hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                                                        title="삭제"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            });
                        })()}

                        {/* 새 행 입력 */}
                        {isAddingNew && (
                            <tr className="border-b border-primary-500/20 bg-primary-500/[0.04]">
                                <td className="px-4 py-2.5 text-gray-600 text-xs">새</td>
                                <td className="px-2 py-1.5">
                                    <div className="flex items-center gap-2">
                                        <input
                                            ref={newCatRef}
                                            type="text"
                                            value={newRow.requirement}
                                            onChange={e => setNewRow(v => ({ ...v, requirement: e.target.value }))}
                                            onKeyDown={handleNewRowKey}
                                            placeholder="항목 * (Enter로 추가)"
                                            className="flex-1 px-2 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-white text-xs outline-none focus:ring-1 focus:ring-primary-500/50 placeholder-gray-600"
                                        />
                                        <button
                                            onClick={handleAddNew}
                                            className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-xs rounded-lg transition-colors flex-shrink-0 font-medium"
                                        >
                                            추가
                                        </button>
                                        <button
                                            onClick={() => { setIsAddingNew(false); setNewRow({ category: '', subcategory: '', requirement: '' }); }}
                                            className="p-1.5 rounded-lg bg-white/[0.04] text-gray-500 hover:text-white transition-colors flex-shrink-0"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </td>
                                <td className="px-2 py-1.5">
                                    <input
                                        type="text"
                                        list="new_cat_autocomplete"
                                        value={newRow.category}
                                        onChange={e => setNewRow(v => ({ ...v, category: e.target.value }))}
                                        onKeyDown={handleNewRowKey}
                                        placeholder="1차 그룹 *"
                                        className="w-full px-2 py-1.5 bg-white/[0.06] border border-red-500/30 rounded-lg text-red-100 text-xs outline-none focus:ring-1 focus:ring-red-500/50 placeholder-gray-600"
                                    />
                                    <datalist id="new_cat_autocomplete">
                                        {categoryList.map(c => <option key={c} value={c} />)}
                                    </datalist>
                                </td>
                                <td className="px-2 py-1.5">
                                    <input
                                        type="text"
                                        list="new_subcat_autocomplete"
                                        value={newRow.subcategory}
                                        onChange={e => setNewRow(v => ({ ...v, subcategory: e.target.value }))}
                                        onKeyDown={handleNewRowKey}
                                        placeholder="2차 그룹 (선택)"
                                        className="w-full px-2 py-1.5 bg-white/[0.06] border border-blue-500/30 rounded-lg text-blue-100 text-xs outline-none focus:ring-1 focus:ring-blue-500/50 placeholder-gray-600"
                                    />
                                    <datalist id="new_subcat_autocomplete">
                                        {subcategoryList.map(c => <option key={c} value={c} />)}
                                    </datalist>
                                </td>
                                <td />
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* 하단 빠른 추가 버튼 */}
                <button
                    onClick={() => {
                        setIsAddingNew(true);
                        setTimeout(() => newCatRef.current?.focus(), 50);
                    }}
                    className="w-full py-3 text-gray-600 hover:text-gray-400 hover:bg-white/[0.02] transition-colors text-sm flex items-center justify-center gap-2 border-t border-white/[0.04]"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    새 요구사항 추가
                </button>

                {/* 하단 요약 */}
                {requirements.length > 0 && (
                    <div className="px-6 py-3 border-t border-white/[0.06] bg-white/[0.01] flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>총 <span className="text-white font-semibold">{requirements.length}</span>개 요구사항</span>
                            <span className="text-gray-700">|</span>
                            <span><span className="text-white font-semibold">{groupedCategories.length}</span>개 카테고리</span>
                            <span className="text-gray-700">|</span>
                            <span>Kano 질문 세트 <span className="text-primary-400 font-semibold">{requirements.length}</span>개 생성 가능</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {groupedCategories.map(cat => {
                                const c = categoryColors[cat] || CATEGORY_COLORS[0];
                                return (
                                    <span key={cat} className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] border ${c.bg} ${c.text} ${c.border}`}>
                                        {cat}
                                        <span className="ml-1 text-gray-600">
                                            {requirements.filter(r => r.category === cat).length}
                                        </span>
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* 입력 가이드 */}
            {requirements.length === 0 && !isAddingNew && (
                <div className="card bg-blue-500/[0.04] border-blue-500/15">
                    <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        입력 가이드
                    </h3>
                    <ul className="text-sm text-gray-400 space-y-1">
                        <li>• <strong className="text-gray-300">카테고리</strong>: 요구사항의 대분류 (예: 기능, 성능, 디자인)</li>
                        <li>• <strong className="text-gray-300">서브카테고리</strong>: 세부 분류 (선택사항)</li>
                        <li>• <strong className="text-gray-300">요구사항</strong>: 구체적인 고객 니즈 설명</li>
                        <li>• 항목을 클릭하면 바로 수정할 수 있으며, <strong className="text-gray-300">Enter</strong>로 빠르게 추가할 수 있습니다</li>
                    </ul>
                </div>
            )}
        </div>
    );
}
