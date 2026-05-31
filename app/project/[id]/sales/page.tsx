'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface SalesRow {
    id: string;
    no: number;
    customer: string;   // 매출처
    amount: number;      // 매출액 (백만원)
    competitor: string;  // 경쟁사명
}

export default function SalesPage() {
    const params = useParams();
    const projectId = params.id as string;
    const [rows, setRows] = useState<SalesRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // 로컬스토리지에서 로드
        const saved = localStorage.getItem(`sales_${projectId}`);
        if (saved) {
            const parsed = JSON.parse(saved);
            setRows(parsed);
        }
        setIsLoading(false);
    }, [projectId]);

    const save = (data: SalesRow[]) => {
        localStorage.setItem(`sales_${projectId}`, JSON.stringify(data));
        alert('저장되었습니다.');
    };

    const addRow = () => {
        const newRow: SalesRow = { id: `s_${Date.now()}`, no: rows.length + 1, customer: '', amount: 0, competitor: '' };
        const updated = [...rows, newRow];
        setRows(updated);
    };

    const updateRow = (id: string, field: keyof SalesRow, value: string | number) => {
        setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const deleteRow = (id: string) => setRows(rows.filter(r => r.id !== id));

    const handleSave = () => { save(rows); };
    const handleReset = () => {
        if (!confirm('매출 데이터를 모두 초기화하시겠습니까?')) return;
        setRows([]);
        localStorage.removeItem(`sales_${projectId}`);
    };

    const totalAmount = rows.reduce((s, r) => s + (r.amount || 0), 0);

    if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400">로딩 중...</div></div>;

    return (
        <div className="min-h-screen bg-gray-900">
            <header className="bg-gray-800 border-b border-gray-700">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Link href={`/project/${projectId}`} className="text-gray-400 hover:text-white transition-colors">← 프로젝트</Link>
                            <div className="h-6 w-px bg-gray-700" />
                            <div>
                                <h1 className="text-2xl font-bold text-white">💰 자사매출추정표</h1>
                                <p className="text-sm text-gray-400 mt-1">2025년도 매출처별 매출 현황</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={addRow} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                행 추가
                            </button>
                            <button onClick={handleSave} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                저장
                            </button>
                            <button onClick={handleReset} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm rounded transition-colors flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                리셋
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="card overflow-x-auto">
                    <div className="text-right text-sm text-gray-400 mb-2">(단위: 백만원)</div>
                    <table className="w-full border-collapse text-sm table-fixed bg-gray-900 border border-gray-700">
                        <thead>
                            <tr className="bg-gray-800">
                                <th className="border border-gray-700 p-2 text-gray-300 font-medium text-center w-[50px]">번호</th>
                                <th className="border border-gray-700 p-2 text-gray-300 font-medium text-center">매출처</th>
                                <th className="border border-gray-700 p-2 text-gray-300 font-medium text-center w-[150px]">매출액 (백만원)</th>
                                <th className="border border-gray-700 p-2 text-gray-300 font-medium text-center">경쟁사명</th>
                                <th className="border border-gray-700 p-2 text-gray-500 text-center w-[40px]"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="border border-gray-700 p-8 text-center text-gray-500">
                                        데이터가 없습니다. 우상단의 &apos;행 추가&apos; 버튼을 눌러 입력을 시작하세요.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row, idx) => (
                                    <tr key={row.id} className="hover:bg-gray-800/50 group">
                                        <td className="border border-gray-700 p-0 text-center text-gray-500 bg-gray-800/30 select-none">{idx + 1}</td>
                                        <td className="border border-gray-700 p-0">
                                            <input type="text" value={row.customer} onChange={e => updateRow(row.id, 'customer', e.target.value)} className="w-full h-full p-2 bg-transparent text-white outline-none focus:bg-gray-800 focus:ring-1 focus:ring-blue-500/50 transition-colors" placeholder="입력" />
                                        </td>
                                        <td className="border border-gray-700 p-0">
                                            <input type="number" value={row.amount || ''} onChange={e => updateRow(row.id, 'amount', parseFloat(e.target.value) || 0)} className="w-full h-full p-2 bg-transparent text-amber-300 text-right outline-none focus:bg-gray-800 focus:ring-1 focus:ring-blue-500/50 transition-colors font-mono" placeholder="0" />
                                        </td>
                                        <td className="border border-gray-700 p-0">
                                            <input type="text" value={row.competitor} onChange={e => updateRow(row.id, 'competitor', e.target.value)} className="w-full h-full p-2 bg-transparent text-white outline-none focus:bg-gray-800 focus:ring-1 focus:ring-blue-500/50 transition-colors" placeholder="입력" />
                                        </td>
                                        <td className="border border-gray-700 p-0 text-center relative">
                                            <button onClick={() => deleteRow(row.id)} className="w-full h-full py-2 text-transparent group-hover:text-red-500 hover:bg-red-500/10 transition-all font-bold" title="행 삭제">✕</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                            {rows.length > 0 && (
                                <tr className="bg-gray-800">
                                    <td className="border border-gray-700 p-2 text-center text-gray-300 font-bold" colSpan={2}>합계</td>
                                    <td className="border border-gray-700 p-2 text-right text-amber-300 font-bold font-mono text-base">{totalAmount.toLocaleString()}</td>
                                    <td className="border border-gray-700 p-2" colSpan={2} />
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}
