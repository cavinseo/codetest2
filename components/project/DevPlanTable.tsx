'use client';

import { useState, useEffect, useRef } from 'react';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';

interface DevPlanRow {
    id: string; phase: string; task: string; description: string;
    start: string; end: string; owner: string; status: string; order: number;
}
interface Props { projectId: string; }

const STATUS_COLORS: Record<string, string> = {
    '미시작': 'text-gray-400 bg-gray-500/15',
    '진행중': 'text-blue-400 bg-blue-500/15',
    '완료': 'text-emerald-400 bg-emerald-500/15',
    '지연': 'text-red-400 bg-red-500/15',
};

export default function DevPlanTable({ projectId }: Props) {
    const [rows, setRows] = useState<DevPlanRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { markClean } = useUnsavedChanges(rows);

    const showToast = (msg: string) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast(msg); toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        fetch(`/api/projects/${projectId}/dev-plan`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.rows) setRows(markClean(data.rows.map((r: any) => ({
                    id: r.id, phase: r.phase ?? '', task: r.task ?? '', description: r.description ?? '',
                    start: r.startDate ?? '', end: r.endDate ?? '', owner: r.owner ?? '',
                    status: r.status ?? '미시작', order: r.order,
                }))));
            }).catch(console.error).finally(() => setIsLoading(false));
    }, [projectId, markClean]);

    const addRow = () => setRows(prev => [...prev, { id: `new_${Date.now()}`, phase: '', task: '', description: '', start: '', end: '', owner: '', status: '미시작', order: prev.length }]);
    const updateRow = (id: string, field: keyof DevPlanRow, val: string) => setRows(rows.map(r => r.id === id ? { ...r, [field]: val } : r));
    const deleteRow = (id: string) => setRows(rows.filter(r => r.id !== id));
    const getUniqueValues = (field: 'phase' | 'task' | 'owner') => Array.from(new Set(rows.map(row => row[field].trim()).filter(Boolean)));

    const save = async (data: typeof rows) => {
        const res = await fetch(`/api/projects/${projectId}/dev-plan`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: data.map((r, idx) => ({ phase: r.phase, task: r.task, description: r.description, startDate: r.start, endDate: r.end, owner: r.owner, status: r.status, order: idx })) }),
        });
        if (res.ok) {
            const d = await res.json();
            setRows(markClean(d.rows.map((r: any) => ({ id: r.id, phase: r.phase ?? '', task: r.task ?? '', description: r.description ?? '', start: r.startDate ?? '', end: r.endDate ?? '', owner: r.owner ?? '', status: r.status ?? '미시작', order: r.order }))));
            return true;
        }
        return false;
    };

    const handleSave = async () => { setIsSaving(true); const ok = await save(rows); showToast(ok ? '저장되었습니다.' : '저장에 실패했습니다.'); setIsSaving(false); };
    const handleReset = async () => { setIsSaving(true); const ok = await save([]); if (ok) { setRows([]); setShowResetConfirm(false); showToast('초기화되었습니다.'); } else showToast('초기화에 실패했습니다.'); setIsSaving(false); };

    if (isLoading) return <div className="flex items-center justify-center p-12"><div className="animate-spin h-7 w-7 border-2 border-primary-500 border-t-transparent rounded-full" /></div>;

    return (
        <div className="space-y-4 relative">
            {toast && <div className="fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border bg-emerald-900/90 border-emerald-500/40 text-emerald-200 animate-fade-in"><svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span className="text-sm font-medium">{toast}</span></div>}
            <div className="flex items-center justify-between">
                <div><h2 className="text-xl font-display font-bold text-white">[WS-14] 개발계획서</h2><p className="text-sm text-gray-500 mt-1">단계별 개발 일정 및 담당 계획</p></div>
                <div className="flex items-center gap-2">
                    <button onClick={addRow} className="btn-secondary text-sm flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>행 추가</button>
                    <button onClick={handleSave} disabled={isSaving} className="btn-primary text-sm flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>{isSaving ? '저장 중...' : '저장'}</button>
                    {rows.length > 0 && <button onClick={() => setShowResetConfirm(true)} className="px-3 py-2 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>}
                </div>
            </div>
            {showResetConfirm && (
                <div className="card border-rose-500/25 bg-rose-500/[0.04] animate-fade-in">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-rose-500/15 flex items-center justify-center flex-shrink-0"><svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div><div><p className="text-white text-sm font-semibold">개발계획서 초기화</p><p className="text-rose-300/70 text-xs mt-0.5">모든 데이터가 삭제됩니다.</p></div></div>
                        <div className="flex items-center gap-2"><button onClick={() => setShowResetConfirm(false)} className="btn-secondary text-sm">취소</button><button onClick={handleReset} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm rounded-lg transition-colors font-medium">초기화</button></div>
                    </div>
                </div>
            )}
            <div className="card p-0 overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                    <thead>
                        <tr className="bg-white/[0.04] border-b border-white/[0.08]">
                            <th className="border border-white/[0.06] p-2 text-gray-400 text-center w-[40px]">No</th>
                            <th className="border border-white/[0.06] p-2 text-white font-semibold text-center w-[90px]">단계</th>
                            <th className="border border-white/[0.06] p-2 text-white font-semibold text-center min-w-[130px]">과제/항목</th>
                            <th className="border border-white/[0.06] p-2 text-white font-semibold text-center min-w-[180px]">내용</th>
                            <th className="border border-white/[0.06] p-2 text-cyan-300 font-semibold text-center w-[100px]">시작</th>
                            <th className="border border-white/[0.06] p-2 text-cyan-300 font-semibold text-center w-[100px]">종료</th>
                            <th className="border border-white/[0.06] p-2 text-gray-400 font-semibold text-center w-[80px]">담당</th>
                            <th className="border border-white/[0.06] p-2 text-amber-300 font-semibold text-center w-[90px]">상태</th>
                            <th className="border border-white/[0.06] p-2 w-[40px]" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr><td colSpan={9} className="border border-white/[0.06] p-10 text-center"><p className="text-gray-500 text-sm mb-3">개발계획서를 작성하세요</p><button onClick={addRow} className="btn-primary text-sm">행 추가하기</button></td></tr>
                        ) : rows.map((row, idx) => (
                            <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] group">
                                <td className="border border-white/[0.06] p-2 text-center text-gray-600">{idx + 1}</td>
                                <td className="border border-white/[0.06] p-0">
                                    <input type="text" list={`dev-phase-${row.id}`} value={row.phase} onChange={e => updateRow(row.id, 'phase', e.target.value)} className="w-full p-2 bg-transparent text-white text-xs text-center font-semibold border-none outline-none focus:ring-1 focus:ring-primary-500/50 placeholder-gray-700" placeholder="1단계" />
                                    <datalist id={`dev-phase-${row.id}`}>{getUniqueValues('phase').map((value) => <option key={value} value={value} />)}</datalist>
                                </td>
                                <td className="border border-white/[0.06] p-0">
                                    <input type="text" list={`dev-task-${row.id}`} value={row.task} onChange={e => updateRow(row.id, 'task', e.target.value)} className="w-full p-2 bg-transparent text-white text-xs border-none outline-none focus:ring-1 focus:ring-primary-500/50 placeholder-gray-700" placeholder="과제명" />
                                    <datalist id={`dev-task-${row.id}`}>{getUniqueValues('task').map((value) => <option key={value} value={value} />)}</datalist>
                                </td>
                                <td className="border border-white/[0.06] p-0"><textarea value={row.description} onChange={e => updateRow(row.id, 'description', e.target.value)} className="w-full p-2 bg-transparent text-gray-300 text-xs border-none outline-none focus:ring-1 focus:ring-primary-500/50 resize-none placeholder-gray-700" placeholder="상세 내용" rows={2} /></td>
                                <td className="border border-white/[0.06] p-0 bg-cyan-900/[0.04]"><input type="date" value={row.start} onChange={e => updateRow(row.id, 'start', e.target.value)} className="w-full p-2 bg-transparent text-cyan-300 text-xs border-none outline-none focus:ring-1 focus:ring-cyan-500/50" /></td>
                                <td className="border border-white/[0.06] p-0 bg-cyan-900/[0.04]"><input type="date" value={row.end} onChange={e => updateRow(row.id, 'end', e.target.value)} className="w-full p-2 bg-transparent text-cyan-300 text-xs border-none outline-none focus:ring-1 focus:ring-cyan-500/50" /></td>
                                <td className="border border-white/[0.06] p-0">
                                    <input type="text" list={`dev-owner-${row.id}`} value={row.owner} onChange={e => updateRow(row.id, 'owner', e.target.value)} className="w-full p-2 bg-transparent text-white text-xs text-center border-none outline-none focus:ring-1 focus:ring-primary-500/50 placeholder-gray-700" placeholder="담당자" />
                                    <datalist id={`dev-owner-${row.id}`}>{getUniqueValues('owner').map((value) => <option key={value} value={value} />)}</datalist>
                                </td>
                                <td className="border border-white/[0.06] p-0 text-center"><select value={row.status} onChange={e => updateRow(row.id, 'status', e.target.value)} className={`w-full p-2 bg-transparent text-xs border-none outline-none cursor-pointer font-semibold ${STATUS_COLORS[row.status] || 'text-gray-400'}`}><option value="미시작">미시작</option><option value="진행중">진행중</option><option value="완료">완료</option><option value="지연">지연</option></select></td>
                                <td className="border border-white/[0.06] p-2 text-center"><button onClick={() => deleteRow(row.id)} className="w-6 h-6 rounded flex items-center justify-center text-gray-700 hover:text-rose-400 hover:bg-rose-500/10 transition-colors mx-auto opacity-0 group-hover:opacity-100"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length > 0 && <div className="p-3 border-t border-white/[0.06] flex items-center justify-between"><button onClick={addRow} className="flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm transition-colors group"><div className="w-6 h-6 rounded border-2 border-dashed border-gray-700 group-hover:border-gray-500 flex items-center justify-center transition-colors"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg></div>행 추가</button><span className="text-xs text-gray-600">{rows.length}개 행</span></div>}
            </div>
        </div>
    );
}
