'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface DevPlanRow {
    id: string;
    phase: string;       // 단계
    task: string;         // 과제/항목
    description: string;  // 내용
    start: string;        // 시작
    end: string;          // 종료
    owner: string;        // 담당
    status: string;       // 상태
}

export default function DevPlanPage() {
    const params = useParams();
    const projectId = params.id as string;
    const [rows, setRows] = useState<DevPlanRow[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [hasData, setHasData] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem(`devPlan_${projectId}`);
        if (saved) { const p = JSON.parse(saved); setRows(p); setHasData(p.length > 0); }
        setIsLoading(false);
    }, [projectId]);

    const save = (data: DevPlanRow[]) => { localStorage.setItem(`devPlan_${projectId}`, JSON.stringify(data)); setHasData(data.length > 0); };

    const addRow = () => setRows([...rows, { id: `dp_${Date.now()}`, phase: '', task: '', description: '', start: '', end: '', owner: '', status: '미시작' }]);
    const updateRow = (id: string, field: keyof DevPlanRow, val: string) => setRows(rows.map(r => r.id === id ? { ...r, [field]: val } : r));
    const deleteRow = (id: string) => setRows(rows.filter(r => r.id !== id));

    const handleSave = () => { save(rows); setIsEditing(false); };
    const handleReset = () => { if (!confirm('초기화하시겠습니까?')) return; setRows([]); save([]); setIsEditing(true); };

    const viewMode = hasData && !isEditing;
    const statusColors: Record<string, string> = {
        '미시작': 'text-gray-400 bg-gray-500/20',
        '진행중': 'text-blue-400 bg-blue-500/20',
        '완료': 'text-green-400 bg-green-500/20',
        '지연': 'text-red-400 bg-red-500/20',
    };

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
                                <h1 className="text-2xl font-bold text-white">📝 개발계획서</h1>
                                <p className="text-sm text-gray-400 mt-1">단계별 개발 일정 및 담당 계획</p>
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
                                    {hasData && <button onClick={() => { setIsEditing(false); const s = localStorage.getItem(`devPlan_${projectId}`); if (s) setRows(JSON.parse(s)); }} className="px-4 py-2 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-600">취소</button>}
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
                                <th className="border border-gray-600 p-3 text-white text-center w-[100px]">단계</th>
                                <th className="border border-gray-600 p-3 text-white text-center min-w-[150px]">과제/항목</th>
                                <th className="border border-gray-600 p-3 text-white text-center min-w-[200px]">내용</th>
                                <th className="border border-gray-600 p-3 text-white text-center w-[110px]">시작</th>
                                <th className="border border-gray-600 p-3 text-white text-center w-[110px]">종료</th>
                                <th className="border border-gray-600 p-3 text-white text-center w-[100px]">담당</th>
                                <th className="border border-gray-600 p-3 text-white text-center w-[100px]">상태</th>
                                {!viewMode && <th className="border border-gray-600 p-3 text-white text-center w-[50px]">삭제</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !isEditing && (
                                <tr><td colSpan={9} className="border border-gray-600 p-12 text-center text-gray-400">
                                    <div className="text-4xl mb-3">📝</div>
                                    <div className="mb-4">개발계획서를 작성하세요</div>
                                    <button onClick={() => { setIsEditing(true); addRow(); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ 작성 시작</button>
                                </td></tr>
                            )}
                            {rows.map((row, idx) => (
                                <tr key={row.id} className="hover:bg-gray-700/30">
                                    <td className="border border-gray-600 p-2 text-center text-gray-400 bg-gray-800">{idx + 1}</td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-white font-semibold text-center">{row.phase}</div> :
                                            <input type="text" value={row.phase} onChange={e => updateRow(row.id, 'phase', e.target.value)} className="w-full p-2 bg-transparent text-white border-none focus:ring-1 focus:ring-blue-500 text-center" placeholder="1단계" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-white">{row.task}</div> :
                                            <input type="text" value={row.task} onChange={e => updateRow(row.id, 'task', e.target.value)} className="w-full p-2 bg-transparent text-white border-none focus:ring-1 focus:ring-blue-500" placeholder="과제명" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-gray-300">{row.description}</div> :
                                            <textarea value={row.description} onChange={e => updateRow(row.id, 'description', e.target.value)} className="w-full p-2 bg-transparent text-gray-300 border-none focus:ring-1 focus:ring-blue-500 resize-none" placeholder="상세 내용" rows={2} />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-cyan-300 text-center">{row.start}</div> :
                                            <input type="date" value={row.start} onChange={e => updateRow(row.id, 'start', e.target.value)} className="w-full p-2 bg-transparent text-cyan-300 border-none focus:ring-1 focus:ring-blue-500" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-cyan-300 text-center">{row.end}</div> :
                                            <input type="date" value={row.end} onChange={e => updateRow(row.id, 'end', e.target.value)} className="w-full p-2 bg-transparent text-cyan-300 border-none focus:ring-1 focus:ring-blue-500" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50">
                                        {viewMode ? <div className="p-2 text-white text-center">{row.owner}</div> :
                                            <input type="text" value={row.owner} onChange={e => updateRow(row.id, 'owner', e.target.value)} className="w-full p-2 bg-transparent text-white text-center border-none focus:ring-1 focus:ring-blue-500" placeholder="담당자" />}
                                    </td>
                                    <td className="border border-gray-600 p-0 bg-gray-800/50 text-center">
                                        {viewMode ? <div className={`p-2 text-center text-sm font-bold p-1 rounded ${statusColors[row.status] || 'text-gray-400'}`}>{row.status}</div> :
                                            <select value={row.status} onChange={e => updateRow(row.id, 'status', e.target.value)} className="w-full p-2 bg-transparent text-white border-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                                                <option value="미시작">미시작</option>
                                                <option value="진행중">진행중</option>
                                                <option value="완료">완료</option>
                                                <option value="지연">지연</option>
                                            </select>}
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
