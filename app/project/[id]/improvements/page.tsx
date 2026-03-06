'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface ImprovementRow {
    id: string;
    rank: number;
    customerNeed: string;      // 고객니즈
    improvementRate: string;   // 경쟁사대비 수준향상율
    devProportion: string;     // 개발향상비중
}

interface ImprovementFeature {
    id: string;
    rank: number;
    feature: string;           // 개선 기능/성능
    priority: string;          // 우선순위
}

export default function ImprovementsPage() {
    const params = useParams();
    const projectId = params.id as string;
    const [rows, setRows] = useState<ImprovementRow[]>([]);
    const [features, setFeatures] = useState<ImprovementFeature[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [hasData, setHasData] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem(`improvements_${projectId}`);
        if (saved) { const p = JSON.parse(saved); setRows(p.rows || []); setFeatures(p.features || []); setHasData((p.rows || []).length > 0); }
        setIsLoading(false);
    }, [projectId]);

    const save = (r: ImprovementRow[], f: ImprovementFeature[]) => { localStorage.setItem(`improvements_${projectId}`, JSON.stringify({ rows: r, features: f })); setHasData(r.length > 0); };

    const addRow = () => setRows([...rows, { id: `imp_${Date.now()}`, rank: rows.length + 1, customerNeed: '', improvementRate: '', devProportion: '' }]);
    const addFeature = () => setFeatures([...features, { id: `impf_${Date.now()}`, rank: features.length + 1, feature: '', priority: '' }]);

    const updateRow = (id: string, field: keyof ImprovementRow, val: string | number) => setRows(rows.map(r => r.id === id ? { ...r, [field]: val } : r));
    const updateFeature = (id: string, field: keyof ImprovementFeature, val: string | number) => setFeatures(features.map(f => f.id === id ? { ...f, [field]: val } : f));

    const deleteRow = (id: string) => setRows(rows.filter(r => r.id !== id));
    const deleteFeature = (id: string) => setFeatures(features.filter(f => f.id !== id));

    const handleSave = () => { save(rows, features); setIsEditing(false); };
    const handleReset = () => { if (!confirm('초기화하시겠습니까?')) return; setRows([]); setFeatures([]); save([], []); setIsEditing(true); };

    const viewMode = hasData && !isEditing;

    if (isLoading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center"><div className="text-white">로딩 중...</div></div>;

    return (
        <div className="min-h-screen bg-gray-900">
            <header className="bg-gray-800 border-b border-gray-700">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Link href={`/project/${projectId}`} className="text-gray-400 hover:text-white transition-colors">← 프로젝트</Link>
                            <div className="h-6 w-px bg-gray-700" />
                            <div>
                                <h1 className="text-2xl font-bold text-white">🎯 개선포인트도출</h1>
                                <p className="text-sm text-gray-400 mt-1">개선포인트점수 기반 고객니즈 우선순위</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {viewMode ? (
                                <>
                                    <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">✏️ 수정</button>
                                    <button onClick={handleReset} className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30">🔄 리셋</button>
                                </>
                            ) : (
                                <>
                                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">💾 저장</button>
                                    {hasData && <button onClick={() => { setIsEditing(false); const s = localStorage.getItem(`improvements_${projectId}`); if (s) { const p = JSON.parse(s); setRows(p.rows || []); setFeatures(p.features || []); } }} className="px-4 py-2 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-600">취소</button>}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                {/* 고객니즈 우선순위 테이블 */}
                <div className="card overflow-x-auto">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-white">개선포인트점수 기반 고객니즈 우선순위</h2>
                        {!viewMode && <button onClick={addRow} className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">+ 행 추가</button>}
                    </div>
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="bg-gray-700">
                                <th className="border border-gray-600 p-3 text-white text-center w-[60px]">순위</th>
                                <th className="border border-gray-600 p-3 text-white text-center min-w-[200px]">고객니즈</th>
                                <th className="border border-gray-600 p-3 text-white text-center min-w-[150px]">경쟁사대비 수준향상율</th>
                                <th className="border border-gray-600 p-3 text-white text-center min-w-[120px]">개발향상비중</th>
                                {!viewMode && <th className="border border-gray-600 p-3 text-white text-center w-[50px]">삭제</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !isEditing && (
                                <tr><td colSpan={5} className="border border-gray-600 p-8 text-center text-gray-400">
                                    <button onClick={() => { setIsEditing(true); addRow(); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ 작성 시작</button>
                                </td></tr>
                            )}
                            {rows.map((row, idx) => (
                                <tr key={row.id} className="hover:bg-gray-700/30">
                                    <td className="border border-gray-600 p-2 text-center text-amber-300 bg-gray-800 font-bold">{idx + 1}</td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-white">{row.customerNeed}</div> :
                                            <input type="text" value={row.customerNeed} onChange={e => updateRow(row.id, 'customerNeed', e.target.value)} className="w-full p-2 bg-transparent text-white border-none focus:ring-1 focus:ring-blue-500" placeholder="고객 니즈" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-cyan-300 text-center">{row.improvementRate}</div> :
                                            <input type="text" value={row.improvementRate} onChange={e => updateRow(row.id, 'improvementRate', e.target.value)} className="w-full p-2 bg-transparent text-cyan-300 text-center border-none focus:ring-1 focus:ring-blue-500" placeholder="예: 1.5" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-green-300 text-center">{row.devProportion}</div> :
                                            <input type="text" value={row.devProportion} onChange={e => updateRow(row.id, 'devProportion', e.target.value)} className="w-full p-2 bg-transparent text-green-300 text-center border-none focus:ring-1 focus:ring-blue-500" placeholder="예: 30%" />}
                                    </td>
                                    {!viewMode && <td className="border border-gray-600 p-2 text-center bg-gray-800"><button onClick={() => deleteRow(row.id)} className="text-red-400 hover:text-red-300">✕</button></td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 개선 기능/성능 List */}
                <div className="card overflow-x-auto">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-white">개선포인트기반 개선 기능/성능 List</h2>
                        {!viewMode && <button onClick={addFeature} className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">+ 행 추가</button>}
                    </div>
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="bg-gray-700">
                                <th className="border border-gray-600 p-3 text-white text-center w-[60px]">순위</th>
                                <th className="border border-gray-600 p-3 text-white text-center min-w-[300px]">개선 기능/성능</th>
                                <th className="border border-gray-600 p-3 text-white text-center w-[120px]">우선순위</th>
                                {!viewMode && <th className="border border-gray-600 p-3 text-white text-center w-[50px]">삭제</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {features.length === 0 && !isEditing && rows.length > 0 && (
                                <tr><td colSpan={4} className="border border-gray-600 p-8 text-center text-gray-400">
                                    <button onClick={() => addFeature()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ 개선 기능 추가</button>
                                </td></tr>
                            )}
                            {features.map((f, idx) => (
                                <tr key={f.id} className="hover:bg-gray-700/30">
                                    <td className="border border-gray-600 p-2 text-center text-amber-300 bg-gray-800 font-bold">{idx + 1}</td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-white">{f.feature}</div> :
                                            <input type="text" value={f.feature} onChange={e => updateFeature(f.id, 'feature', e.target.value)} className="w-full p-2 bg-transparent text-white border-none focus:ring-1 focus:ring-blue-500" placeholder="개선할 기능 또는 성능" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-amber-300 text-center font-bold">{f.priority}</div> :
                                            <input type="text" value={f.priority} onChange={e => updateFeature(f.id, 'priority', e.target.value)} className="w-full p-2 bg-transparent text-amber-300 text-center border-none focus:ring-1 focus:ring-blue-500" placeholder="상/중/하" />}
                                    </td>
                                    {!viewMode && <td className="border border-gray-600 p-2 text-center bg-gray-800"><button onClick={() => deleteFeature(f.id)} className="text-red-400 hover:text-red-300">✕</button></td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}
