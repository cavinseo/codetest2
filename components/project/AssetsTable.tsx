'use client';

import { useCallback, useEffect, useState } from 'react';
import WorksheetLoadError from './WorksheetLoadError';
import { useUnsavedWorksheet } from './useUnsavedWorksheet';
import HeaderToast from '@/components/HeaderToast';
import { useToast } from '@/components/useToast';

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
    const { toast, showToast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setLoadFailed(false);
        try {
            const res = await fetch(`/api/projects/${projectId}/assets`);
            if (!res.ok) throw new Error('자산 조회 실패');
            if (res.ok) {
                const data = await res.json();
                if (!Array.isArray(data.assets)) throw new Error('자산 응답 형식 오류');
                setAssets(data.assets);
                setLoadedProjectId(projectId);
            }
        } catch (error) {
            setLoadFailed(true);
            console.error('Failed to load assets:', error);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const { markSaved } = useUnsavedWorksheet(assets, !isLoading && !loadFailed && loadedProjectId === projectId);

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
    const getUniqueValues = (field: 'category' | 'content', type?: AssetItem['type']) =>
        Array.from(new Set(assets.filter((asset) => !type || asset.type === type).map((asset) => (asset[field] || '').trim()).filter(Boolean)));

    const handleSave = async () => {
        if (isLoading || loadFailed || loadedProjectId !== projectId) return;
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/assets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assets })
            });
            // 실패해도 아무 표시가 없어 저장된 줄 알고 떠나면 입력이 사라졌다(2026-11-08 코드 리뷰 9번).
            if (res.ok) {
                markSaved();
                showToast('저장되었습니다.');
                loadData();
            } else {
                showToast('저장에 실패했습니다. 다시 시도하세요.', 'error');
            }
        } catch (error) {
            console.error('Failed to save assets:', error);
            showToast('저장에 실패했습니다. 연결을 확인하고 다시 시도하세요.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // 저장 뒤 다시 불러오는 동안에도 저장 결과 알림이 보이도록 로딩 화면에도 둔다.
    const toastElement = toast && <HeaderToast message={toast.message} type={toast.type} />;
    if (loadFailed) return <>{toastElement}<WorksheetLoadError onRetry={loadData} /></>;
    if (isLoading || loadedProjectId !== projectId) return <>{toastElement}<div className="p-8 text-center text-gray-400">로딩 중...</div></>;

    const coreAssets = assets.filter(a => a.type === 'CORE');
    const compAssets = assets.filter(a => a.type === 'COMPLEMENTARY');

    return (
        <div className="space-y-8">
            {toastElement}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">[WS-14] 핵심자산 및 보완자산 도출표</h2>
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
                                        list={`core-asset-content-${a.id}`}
                                        value={a.content || ''}
                                        onChange={(e) => updateRow(a.id, 'content', e.target.value)}
                                        className="w-full bg-transparent px-4 py-2 text-white outline-none"
                                        placeholder="핵심자산 입력"
                                    />
                                    <datalist id={`core-asset-content-${a.id}`}>
                                        {getUniqueValues('content', 'CORE').map((value) => <option key={value} value={value} />)}
                                    </datalist>
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
                                        list={`comp-asset-category-${a.id}`}
                                        value={a.category || ''}
                                        onChange={(e) => updateRow(a.id, 'category', e.target.value)}
                                        className="w-full bg-transparent px-4 py-2 text-white outline-none"
                                        placeholder="필요 항목"
                                    />
                                    <datalist id={`comp-asset-category-${a.id}`}>
                                        {getUniqueValues('category', 'COMPLEMENTARY').map((value) => <option key={value} value={value} />)}
                                    </datalist>
                                </td>
                                <td className="p-0">
                                    <input
                                        type="text"
                                        list={`comp-asset-content-${a.id}`}
                                        value={a.content || ''}
                                        onChange={(e) => updateRow(a.id, 'content', e.target.value)}
                                        className="w-full bg-transparent px-4 py-2 text-white outline-none"
                                        placeholder="해결방안"
                                    />
                                    <datalist id={`comp-asset-content-${a.id}`}>
                                        {getUniqueValues('content', 'COMPLEMENTARY').map((value) => <option key={value} value={value} />)}
                                    </datalist>
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
