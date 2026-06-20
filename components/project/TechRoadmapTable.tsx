'use client';

import { useEffect, useRef, useState } from 'react';

interface FutureCustomerRow {
    id: string;
    category: string;
    techItem: string;
    currentLevel: string;
    targetLevel: string;
    order: number;
}

interface Props {
    projectId: string;
}

export default function TechRoadmapTable({ projectId }: Props) {
    const [rows, setRows] = useState<FutureCustomerRow[]>([]);
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
        fetch(`/api/projects/${projectId}/tech-roadmap`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data?.rows) {
                    setRows(data.rows.map((r: any) => ({
                        id: r.id,
                        category: r.category ?? '',
                        techItem: r.techItem ?? '',
                        currentLevel: r.currentLevel ?? '',
                        targetLevel: r.targetLevel ?? '',
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
            techItem: '',
            currentLevel: '',
            targetLevel: '',
            order: prev.length,
        }]);
    };

    const updateRow = (id: string, field: keyof FutureCustomerRow, value: string) => {
        setRows(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    };

    const deleteRow = (id: string) => setRows(rows.filter((row) => row.id !== id));
    const getUniqueValues = (field: keyof Pick<FutureCustomerRow, 'category' | 'techItem' | 'currentLevel' | 'targetLevel'>) =>
        Array.from(new Set(rows.map((row) => String(row[field] ?? '').trim()).filter(Boolean)));

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/tech-roadmap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rows: rows.map((row, idx) => ({
                        category: row.category,
                        techItem: row.techItem,
                        currentLevel: row.currentLevel,
                        targetLevel: row.targetLevel,
                        q1: '',
                        q2: '',
                        q3: '',
                        q4: '',
                        owner: '',
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
                techItem: r.techItem ?? '',
                currentLevel: r.currentLevel ?? '',
                targetLevel: r.targetLevel ?? '',
                order: r.order,
            })));
            showToast('저장되었습니다.');
        } catch {
            showToast('저장에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const input = (value: string, onChange: (value: string) => void, placeholder: string, optionsId: string, options: string[]) => (
        <>
            <input
                type="text"
                list={optionsId}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="w-full bg-transparent px-3 py-2 text-sm text-white outline-none focus:bg-white/5 placeholder-gray-700"
                placeholder={placeholder}
            />
            <datalist id={optionsId}>
                {options.map((option) => <option key={option} value={option} />)}
            </datalist>
        </>
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
                    <h2 className="text-xl font-display font-bold text-white">[WS-13] KS-QFD를 활용한 제품/서비스의 개선 방향성</h2>
                    <p className="text-sm text-gray-500 mt-1">향후목표고객LIST 워크시트의 5열 구조를 그대로 사용합니다.</p>
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
                            <th className="border border-white/[0.06] p-3 text-gray-400 text-center w-[60px]">순위</th>
                            <th className="border border-white/[0.06] p-3 text-white font-semibold text-center min-w-[260px]">고객혜택 제공을 위한 제품/서비스개선 방향(차별화)</th>
                            <th className="border border-white/[0.06] p-3 text-white font-semibold text-center min-w-[180px]">개선기능 및 성능향상</th>
                            <th className="border border-white/[0.06] p-3 text-white font-semibold text-center min-w-[180px]">개선을 위한 구현가능성</th>
                            <th className="border border-white/[0.06] p-3 text-white font-semibold text-center min-w-[160px]">목표 고객</th>
                            <th className="border border-white/[0.06] p-3 w-[48px]" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="border border-white/[0.06] p-10 text-center">
                                    <p className="text-gray-500 text-sm mb-3">개선 방향성과 목표 고객을 추가하세요.</p>
                                    <button onClick={addRow} className="btn-primary text-sm">첫 행 추가</button>
                                </td>
                            </tr>
                        ) : rows.map((row, idx) => (
                            <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] group">
                                <td className="border border-white/[0.06] p-2 text-center text-gray-500">{idx + 1}</td>
                                <td className="border border-white/[0.06] p-0">{input(row.category, (value) => updateRow(row.id, 'category', value), '개선 방향', `roadmap-category-${row.id}`, getUniqueValues('category'))}</td>
                                <td className="border border-white/[0.06] p-0">{input(row.techItem, (value) => updateRow(row.id, 'techItem', value), '개선기능 및 성능향상', `roadmap-tech-${row.id}`, getUniqueValues('techItem'))}</td>
                                <td className="border border-white/[0.06] p-0">{input(row.currentLevel, (value) => updateRow(row.id, 'currentLevel', value), '구현가능성', `roadmap-current-${row.id}`, getUniqueValues('currentLevel'))}</td>
                                <td className="border border-white/[0.06] p-0">{input(row.targetLevel, (value) => updateRow(row.id, 'targetLevel', value), '목표 고객', `roadmap-target-${row.id}`, getUniqueValues('targetLevel'))}</td>
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
