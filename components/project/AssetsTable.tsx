'use client';

import { useState, useEffect } from 'react';

interface AssetItem {
    id: string;
    type: 'CORE' | 'COMPLEMENTARY';
    category?: string;
    content?: string;
    order: number;
}

interface AssetsTableProps {
    projectId: string;
}

export default function AssetsTable({ projectId }: AssetsTableProps) {
    const [assets, setAssets] = useState<AssetItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        loadData();
    }, [projectId]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/assets`);
            if (res.ok) {
                const data = await res.json();
                setAssets(data.assets || []);
            }
        } catch (error) {
            console.error('Failed to load assets:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const addRow = (type: 'CORE' | 'COMPLEMENTARY') => {
        const newRow: AssetItem = {
            id: `new_${Date.now()}`,
            type,
            category: type === 'COMPLEMENTARY' ? '' : undefined,
            content: '',
            order: assets.length
        };
        setAssets([...assets, newRow]);
    };

    const updateRow = (id: string, field: keyof AssetItem, value: string) => {
        setAssets(assets.map(a => a.id === id ? { ...a, [field]: value } : a));
    };

    const deleteRow = (id: string) => {
        setAssets(assets.filter(a => a.id !== id));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/assets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assets })
            });
            if (res.ok) {
                alert('저장되었습니다.');
                loadData();
            }
        } catch (error) {
            console.error('Failed to save assets:', error);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="p-8 text-center text-gray-400">로딩 중...</div>;

    const coreAssets = assets.filter(a => a.type === 'CORE');
    const compAssets = assets.filter(a => a.type === 'COMPLEMENTARY');

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">핵심자산 및 보완자산 도출표</h2>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="btn-primary"
                >
                    {isSaving ? '저장 중...' : '저장'}
                </button>
            </div>

            {/* 핵심자산 */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-cyan-400">핵심자산 도출표</h3>
                    <button onClick={() => addRow('CORE')} className="btn-secondary text-xs">+ 추가</button>
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-white/10 text-gray-400">
                            <th className="px-4 py-2 text-left w-16">No</th>
                            <th className="px-4 py-2 text-left">핵심자산</th>
                            <th className="px-4 py-2 w-16"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {coreAssets.map((a, i) => (
                            <tr key={a.id} className="border-b border-white/5">
                                <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                                <td className="p-0">
                                    <input
                                        type="text"
                                        value={a.content || ''}
                                        onChange={(e) => updateRow(a.id, 'content', e.target.value)}
                                        className="w-full bg-transparent px-4 py-2 text-white outline-none"
                                        placeholder="핵심자산 입력"
                                    />
                                </td>
                                <td className="px-4 py-2">
                                    <button onClick={() => deleteRow(a.id)} className="text-rose-500 hover:text-rose-400">삭제</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 보완자산 */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-amber-400">보완자산 도출표</h3>
                    <button onClick={() => addRow('COMPLEMENTARY')} className="btn-secondary text-xs">+ 추가</button>
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-white/10 text-gray-400">
                            <th className="px-4 py-2 text-left">필요 항목</th>
                            <th className="px-4 py-2 text-left">해결방안</th>
                            <th className="px-4 py-2 w-16"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {compAssets.map((a) => (
                            <tr key={a.id} className="border-b border-white/5">
                                <td className="p-0 border-r border-white/5">
                                    <input
                                        type="text"
                                        value={a.category || ''}
                                        onChange={(e) => updateRow(a.id, 'category', e.target.value)}
                                        className="w-full bg-transparent px-4 py-2 text-white outline-none"
                                        placeholder="필요 항목"
                                    />
                                </td>
                                <td className="p-0">
                                    <input
                                        type="text"
                                        value={a.content || ''}
                                        onChange={(e) => updateRow(a.id, 'content', e.target.value)}
                                        className="w-full bg-transparent px-4 py-2 text-white outline-none"
                                        placeholder="해결방안"
                                    />
                                </td>
                                <td className="px-4 py-2">
                                    <button onClick={() => deleteRow(a.id)} className="text-rose-500 hover:text-rose-400">삭제</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
