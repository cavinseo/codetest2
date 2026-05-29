'use client';

import { useEffect, useRef, useState } from 'react';

interface TargetSpecRow {
    id: string;
    category: string;
    subCategory: string;
    specItem: string;
    unit: string;
    targetValue: string;
    note: string;
    order: number;
}

interface Props {
    projectId: string;
}

export default function TargetSpecTable({ projectId }: Props) {
    const [rows, setRows] = useState<TargetSpecRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (msg: string) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast(msg);
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        fetch(`/api/projects/${projectId}/target-spec`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                const sourceRows = data?.rows?.length > 0 ? data.rows : (data?.suggestions || []);
                if (sourceRows) {
                    setRows(sourceRows.map((r: any) => ({
                        id: r.id,
                        category: r.category ?? '',
                        subCategory: r.subCategory ?? '',
                        specItem: r.specItem ?? '',
                        unit: r.unit ?? '',
                        targetValue: r.targetValue ?? '',
                        note: r.note ?? '',
                        order: r.order,
                    })));
                }
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, [projectId]);

    const addRow = () => {
        setRows((prev) => [...prev, {
            id: `new_${Date.now()}`,
            category: '',
            subCategory: '',
            specItem: '',
            unit: '',
            targetValue: '',
            note: '',
            order: prev.length,
        }]);
    };

    const updateRow = (id: string, field: keyof TargetSpecRow, value: string) => {
        setRows(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    };

    const deleteRow = (id: string) => setRows(rows.filter((row) => row.id !== id));

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/target-spec`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rows: rows.map((row, idx) => ({
                        category: row.category,
                        subCategory: row.subCategory,
                        specItem: row.specItem,
                        unit: row.unit,
                        targetValue: row.targetValue,
                        note: row.note,
                        order: idx,
                    })),
                }),
            });

            if (!res.ok) {
                showToast('저장에 실패했습니다.');
                return;
            }

            const data = await res.json();
            setRows(data.rows.map((r: any) => ({
                id: r.id,
                category: r.category ?? '',
                subCategory: r.subCategory ?? '',
                specItem: r.specItem ?? '',
                unit: r.unit ?? '',
                targetValue: r.targetValue ?? '',
                note: r.note ?? '',
                order: r.order,
            })));
            showToast('저장되었습니다.');
        } catch {
            showToast('저장에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const input = (value: string, onChange: (value: string) => void, placeholder: string) => (
        <input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full bg-transparent px-3 py-2 text-sm text-white outline-none focus:bg-white/5 placeholder-gray-700"
            placeholder={placeholder}
        />
    );

    if (isLoading) {
        return <div className="flex items-center justify-center p-12"><div className="animate-spin h-7 w-7 border-2 border-primary-500 border-t-transparent rounded-full" /></div>;
    }

    return (
        <div className="space-y-4 relative">
            {toast && (
                <div className="fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border bg-emerald-900/90 border-emerald-500/40 text-emerald-200 animate-fade-in">
                    <span className="text-sm font-medium">{toast}</span>
                </div>
            )}

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">최종 제품/서비스 제공 스펙 List</h2>
                    <p className="text-sm text-gray-500 mt-1">워크시트의 최종목표스펙도출 형식에 맞춰 작성합니다.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={addRow} className="btn-secondary text-sm">행 추가</button>
                    <button onClick={handleSave} disabled={isSaving} className="btn-primary text-sm">
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                </div>
            </div>

            <div className="card p-0 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-white/[0.04] border-b border-white/[0.08]">
                            <th className="border border-white/[0.06] p-3 text-white font-semibold text-center min-w-[140px]">스펙분류</th>
                            <th className="border border-white/[0.06] p-3 text-white font-semibold text-center min-w-[180px]">세부항목</th>
                            <th className="border border-white/[0.06] p-3 text-white font-semibold text-center min-w-[180px]">기술적 특성</th>
                            <th className="border border-white/[0.06] p-3 text-white font-semibold text-center min-w-[90px]">측정단위</th>
                            <th className="border border-white/[0.06] p-3 text-white font-semibold text-center min-w-[120px]">설계 목표치</th>
                            <th className="border border-white/[0.06] p-3 text-white font-semibold text-center min-w-[120px]">개선여부</th>
                            <th className="border border-white/[0.06] p-3 w-[48px]" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="border border-white/[0.06] p-10 text-center">
                                    <p className="text-gray-500 text-sm mb-3">최종 목표 스펙 항목을 추가하세요.</p>
                                    <button onClick={addRow} className="btn-primary text-sm">첫 행 추가</button>
                                </td>
                            </tr>
                        ) : rows.map((row) => (
                            <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] group">
                                <td className="border border-white/[0.06] p-0">{input(row.category, (value) => updateRow(row.id, 'category', value), '스펙분류')}</td>
                                <td className="border border-white/[0.06] p-0">{input(row.subCategory, (value) => updateRow(row.id, 'subCategory', value), '세부항목')}</td>
                                <td className="border border-white/[0.06] p-0">{input(row.specItem, (value) => updateRow(row.id, 'specItem', value), '기술적 특성')}</td>
                                <td className="border border-white/[0.06] p-0">{input(row.unit, (value) => updateRow(row.id, 'unit', value), '단위')}</td>
                                <td className="border border-white/[0.06] p-0">{input(row.targetValue, (value) => updateRow(row.id, 'targetValue', value), '목표치')}</td>
                                <td className="border border-white/[0.06] p-0">{input(row.note, (value) => updateRow(row.id, 'note', value), '개선여부')}</td>
                                <td className="border border-white/[0.06] p-2 text-center">
                                    <button onClick={() => deleteRow(row.id)} className="text-rose-500 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100">삭제</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length > 0 && (
                    <div className="p-3 border-t border-white/[0.06] flex items-center justify-between">
                        <button onClick={addRow} className="text-gray-500 hover:text-gray-300 text-sm">행 추가</button>
                        <span className="text-xs text-gray-600">{rows.length}개</span>
                    </div>
                )}
            </div>
        </div>
    );
}
