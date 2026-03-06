'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface RoadmapRow {
    id: string;
    category: string;       // 분류
    techItem: string;        // 기술항목
    currentLevel: string;    // 현재수준
    q1: string;              // 1Q
    q2: string;              // 2Q
    q3: string;              // 3Q
    q4: string;              // 4Q
    targetLevel: string;     // 목표수준
    owner: string;           // 담당자
}

export default function TechRoadmapPage() {
    const params = useParams();
    const projectId = params.id as string;
    const [rows, setRows] = useState<RoadmapRow[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [hasData, setHasData] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem(`techRoadmap_${projectId}`);
        if (saved) { const p = JSON.parse(saved); setRows(p); setHasData(p.length > 0); }
        setIsLoading(false);
    }, [projectId]);

    const save = (data: RoadmapRow[]) => { localStorage.setItem(`techRoadmap_${projectId}`, JSON.stringify(data)); setHasData(data.length > 0); };

    const addRow = () => setRows([...rows, { id: `rm_${Date.now()}`, category: '', techItem: '', currentLevel: '', q1: '', q2: '', q3: '', q4: '', targetLevel: '', owner: '' }]);
    const updateRow = (id: string, field: keyof RoadmapRow, val: string) => setRows(rows.map(r => r.id === id ? { ...r, [field]: val } : r));
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
                                <h1 className="text-2xl font-bold text-white">🗺️ 기술 로드맵</h1>
                                <p className="text-sm text-gray-400 mt-1">분기별 기술개발 일정 및 목표</p>
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
                                    {hasData && <button onClick={() => { setIsEditing(false); const s = localStorage.getItem(`techRoadmap_${projectId}`); if (s) setRows(JSON.parse(s)); }} className="px-4 py-2 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-600">취소</button>}
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
                                <th className="border border-gray-600 p-3 text-white text-center min-w-[100px]">분류</th>
                                <th className="border border-gray-600 p-3 text-white text-center min-w-[150px]">기술항목</th>
                                <th className="border border-gray-600 p-3 text-blue-300 text-center w-[100px]">현재수준</th>
                                <th className="border border-gray-600 p-3 text-cyan-300 text-center w-[80px]">1Q</th>
                                <th className="border border-gray-600 p-3 text-cyan-300 text-center w-[80px]">2Q</th>
                                <th className="border border-gray-600 p-3 text-cyan-300 text-center w-[80px]">3Q</th>
                                <th className="border border-gray-600 p-3 text-cyan-300 text-center w-[80px]">4Q</th>
                                <th className="border border-gray-600 p-3 text-green-300 text-center w-[100px]">목표수준</th>
                                <th className="border border-gray-600 p-3 text-white text-center w-[100px]">담당자</th>
                                {!viewMode && <th className="border border-gray-600 p-3 text-white text-center w-[50px]">삭제</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !isEditing && (
                                <tr><td colSpan={11} className="border border-gray-600 p-12 text-center text-gray-400">
                                    <div className="text-4xl mb-3">🗺️</div>
                                    <div className="mb-4">기술 로드맵을 작성하세요</div>
                                    <button onClick={() => { setIsEditing(true); addRow(); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ 작성 시작</button>
                                </td></tr>
                            )}
                            {rows.map((row, idx) => (
                                <tr key={row.id} className="hover:bg-gray-700/30">
                                    <td className="border border-gray-600 p-2 text-center text-gray-400 bg-gray-800">{idx + 1}</td>
                                    {(['category', 'techItem'] as const).map(field => (
                                        <td key={field} className="border border-gray-600 p-0 bg-gray-800/50">
                                            {viewMode ? <div className="p-2 text-white">{row[field]}</div> :
                                                <input type="text" value={row[field]} onChange={e => updateRow(row.id, field, e.target.value)} className="w-full p-2 bg-transparent text-white border-none focus:ring-1 focus:ring-blue-500" placeholder={field === 'category' ? '분류' : '기술항목'} />}
                                        </td>
                                    ))}
                                    <td className="border border-gray-600 p-0 bg-blue-900/10">
                                        {viewMode ? <div className="p-2 text-blue-300 text-center">{row.currentLevel}</div> :
                                            <input type="text" value={row.currentLevel} onChange={e => updateRow(row.id, 'currentLevel', e.target.value)} className="w-full p-2 bg-transparent text-blue-300 text-center border-none focus:ring-1 focus:ring-blue-500" placeholder="현재" />}
                                    </td>
                                    {(['q1', 'q2', 'q3', 'q4'] as const).map(q => (
                                        <td key={q} className="border border-gray-600 p-0 bg-cyan-900/10">
                                            {viewMode ? <div className={`p-2 text-center ${row[q] ? 'text-cyan-300 font-semibold' : 'text-gray-600'}`}>{row[q] || ''}</div> :
                                                <input type="text" value={row[q]} onChange={e => updateRow(row.id, q, e.target.value)} className="w-full p-2 bg-transparent text-cyan-300 text-center border-none focus:ring-1 focus:ring-cyan-500" placeholder="—" />}
                                        </td>
                                    ))}
                                    <td className="border border-gray-600 p-0 bg-green-900/10">
                                        {viewMode ? <div className="p-2 text-green-300 text-center font-bold">{row.targetLevel}</div> :
                                            <input type="text" value={row.targetLevel} onChange={e => updateRow(row.id, 'targetLevel', e.target.value)} className="w-full p-2 bg-transparent text-green-300 text-center border-none focus:ring-1 focus:ring-green-500" placeholder="목표" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-white text-center">{row.owner}</div> :
                                            <input type="text" value={row.owner} onChange={e => updateRow(row.id, 'owner', e.target.value)} className="w-full p-2 bg-transparent text-white text-center border-none focus:ring-1 focus:ring-blue-500" placeholder="담당자" />}
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
