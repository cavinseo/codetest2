'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface TargetSpecRow {
    id: string;
    no: number;
    category: string;        // 구분 (대분류)
    subCategory: string;     // 구분 (소분류)
    specItem: string;        // 사양항목
    unit: string;            // 단위
    currentValue: string;    // 현재 사양
    competitorValue: string; // 경쟁사 사양
    targetValue: string;     // 목표 사양
    note: string;            // 비고
}

export default function TargetSpecPage() {
    const params = useParams();
    const projectId = params.id as string;
    const [rows, setRows] = useState<TargetSpecRow[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [hasData, setHasData] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem(`targetSpec_${projectId}`);
        if (saved) { const p = JSON.parse(saved); setRows(p); setHasData(p.length > 0); }
        setIsLoading(false);
    }, [projectId]);

    const save = (data: TargetSpecRow[]) => { localStorage.setItem(`targetSpec_${projectId}`, JSON.stringify(data)); setHasData(data.length > 0); };

    const addRow = () => setRows([...rows, { id: `ts_${Date.now()}`, no: rows.length + 1, category: '', subCategory: '', specItem: '', unit: '', currentValue: '', competitorValue: '', targetValue: '', note: '' }]);
    const updateRow = (id: string, field: keyof TargetSpecRow, val: string | number) => setRows(rows.map(r => r.id === id ? { ...r, [field]: val } : r));
    const deleteRow = (id: string) => setRows(rows.filter(r => r.id !== id));

    const handleSave = () => { save(rows); setIsEditing(false); };
    const handleReset = () => { if (!confirm('초기화하시겠습니까?')) return; setRows([]); save([]); setIsEditing(true); };

    const viewMode = hasData && !isEditing;

    if (isLoading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center"><div className="text-white">로딩 중...</div></div>;

    return (
        <div className="min-h-screen bg-gray-900">
            <header className="bg-gray-800 border-b border-gray-700">
                <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Link href={`/project/${projectId}`} className="text-gray-400 hover:text-white transition-colors">← 프로젝트</Link>
                            <div className="h-6 w-px bg-gray-700" />
                            <div>
                                <h1 className="text-2xl font-bold text-white">📐 목표사양서</h1>
                                <p className="text-sm text-gray-400 mt-1">현재/경쟁사/목표 사양 비교표</p>
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
                                    <button onClick={addRow} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">+ 행 추가</button>
                                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">💾 저장</button>
                                    {hasData && <button onClick={() => { setIsEditing(false); const s = localStorage.getItem(`targetSpec_${projectId}`); if (s) setRows(JSON.parse(s)); }} className="px-4 py-2 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-600">취소</button>}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="card overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="bg-gray-700">
                                <th className="border border-gray-600 p-3 text-white text-center w-[50px]">No</th>
                                <th className="border border-gray-600 p-3 text-white text-center" colSpan={2}>구분</th>
                                <th className="border border-gray-600 p-3 text-white text-center min-w-[140px]">사양항목</th>
                                <th className="border border-gray-600 p-3 text-white text-center w-[80px]">단위</th>
                                <th className="border border-gray-600 p-3 text-blue-300 text-center min-w-[100px]">현재 사양</th>
                                <th className="border border-gray-600 p-3 text-red-300 text-center min-w-[100px]">경쟁사 사양</th>
                                <th className="border border-gray-600 p-3 text-green-300 text-center min-w-[100px]">목표 사양</th>
                                <th className="border border-gray-600 p-3 text-white text-center min-w-[120px]">비고</th>
                                {!viewMode && <th className="border border-gray-600 p-3 text-white text-center w-[50px]">삭제</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !isEditing && (
                                <tr><td colSpan={10} className="border border-gray-600 p-12 text-center text-gray-400">
                                    <div className="text-4xl mb-3">📐</div>
                                    <div className="mb-4">목표사양서를 작성하세요</div>
                                    <button onClick={() => { setIsEditing(true); addRow(); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ 작성 시작</button>
                                </td></tr>
                            )}
                            {rows.map((row, idx) => (
                                <tr key={row.id} className="hover:bg-gray-700/30">
                                    <td className="border border-gray-600 p-2 text-center text-gray-400 bg-gray-800">{idx + 1}</td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-white">{row.category}</div> :
                                            <input type="text" value={row.category} onChange={e => updateRow(row.id, 'category', e.target.value)} className="w-full p-2 bg-transparent text-white border-none focus:ring-1 focus:ring-blue-500" placeholder="대분류" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-white">{row.subCategory}</div> :
                                            <input type="text" value={row.subCategory} onChange={e => updateRow(row.id, 'subCategory', e.target.value)} className="w-full p-2 bg-transparent text-white border-none focus:ring-1 focus:ring-blue-500" placeholder="소분류" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-white font-semibold">{row.specItem}</div> :
                                            <input type="text" value={row.specItem} onChange={e => updateRow(row.id, 'specItem', e.target.value)} className="w-full p-2 bg-transparent text-white border-none focus:ring-1 focus:ring-blue-500" placeholder="사양항목명" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-gray-300 text-center">{row.unit}</div> :
                                            <input type="text" value={row.unit} onChange={e => updateRow(row.id, 'unit', e.target.value)} className="w-full p-2 bg-transparent text-gray-300 text-center border-none focus:ring-1 focus:ring-blue-500" placeholder="단위" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-blue-900/10">
                                        {viewMode ? <div className="p-2 text-blue-300 text-center">{row.currentValue}</div> :
                                            <input type="text" value={row.currentValue} onChange={e => updateRow(row.id, 'currentValue', e.target.value)} className="w-full p-2 bg-transparent text-blue-300 text-center border-none focus:ring-1 focus:ring-blue-500" placeholder="현재값" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-red-900/10">
                                        {viewMode ? <div className="p-2 text-red-300 text-center">{row.competitorValue}</div> :
                                            <input type="text" value={row.competitorValue} onChange={e => updateRow(row.id, 'competitorValue', e.target.value)} className="w-full p-2 bg-transparent text-red-300 text-center border-none focus:ring-1 focus:ring-blue-500" placeholder="경쟁사값" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-green-900/10">
                                        {viewMode ? <div className="p-2 text-green-300 text-center font-bold">{row.targetValue}</div> :
                                            <input type="text" value={row.targetValue} onChange={e => updateRow(row.id, 'targetValue', e.target.value)} className="w-full p-2 bg-transparent text-green-300 text-center border-none focus:ring-1 focus:ring-blue-500" placeholder="목표값" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-gray-300">{row.note}</div> :
                                            <input type="text" value={row.note} onChange={e => updateRow(row.id, 'note', e.target.value)} className="w-full p-2 bg-transparent text-gray-300 border-none focus:ring-1 focus:ring-blue-500" placeholder="비고" />}
                                    </td>
                                    {!viewMode && <td className="border border-gray-600 p-2 text-center bg-gray-800"><button onClick={() => deleteRow(row.id)} className="text-red-400 hover:text-red-300">✕</button></td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!viewMode && rows.length > 0 && (
                        <div className="mt-3 flex justify-center">
                            <button onClick={addRow} className="px-6 py-2 border-2 border-dashed border-gray-600 text-gray-400 rounded-lg hover:border-green-500 hover:text-green-400">+ 행 추가</button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
