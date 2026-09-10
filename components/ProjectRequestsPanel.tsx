'use client';
// 신청과 심사 상태를 한 화면 계약으로 표시하여 승인 없이 추가 개설하는 혼동을 줄인다.
import { useCallback, useEffect, useState } from 'react';
interface RequestRow { id: string; reason: string; status: string; usedAt: string | null; reviewNote: string | null; mentee: { name: string | null }; program: { name: string }; }
export default function ProjectRequestsPanel({ reviewer = false, onCreate }: { reviewer?: boolean; onCreate?: (approvalId: string) => void }) {
    const [rows, setRows] = useState<RequestRow[]>([]);
    const [count, setCount] = useState(0);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/project-requests'); const data = await res.json();
            if (!res.ok) throw new Error(data.error || '신청 조회 실패');
            setRows(data.requests); setCount(data.ownedProjectCount || 0);
        } catch (cause) { setError(cause instanceof Error ? cause.message : '신청 조회 실패'); }
    }, []);
    useEffect(() => { void load(); }, [load]);
    const submit = async (body: object, method: string) => {
        setBusy(true); setError('');
        try {
            const res = await fetch('/api/project-requests', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json(); if (!res.ok) throw new Error(data.error || '처리 실패');
            setReason(''); await load();
        } catch (cause) { setError(cause instanceof Error ? cause.message : '신청 처리 실패'); }
        finally { setBusy(false); }
    };
    return <section className="card space-y-3 mb-4">
        <h3 className="font-semibold">추가 프로젝트 개설 {reviewer ? '승인 관리' : '신청'}</h3>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        {!reviewer && <p className="text-sm text-gray-400">프로젝트는 1개까지 직접 개설할 수 있으며, 추가 개설마다 승인이 필요합니다. 현재 {count}개를 소유하고 있습니다.</p>}
        {!reviewer && count >= 1 && <form onSubmit={event => { event.preventDefault(); void submit({ reason }, 'POST'); }}>
            <label className="text-sm">추가 개설 사유<textarea className="input mt-2" rows={2} value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} /></label>
            <button disabled={busy || !reason.trim() || rows.some(row => row.status === 'PENDING')} className="btn-primary mt-2">승인 신청</button>
        </form>}
        {rows.map(row => <div key={row.id} className="border-t border-white/10 pt-3 text-sm">
            <p>{reviewer && `${row.mentee.name || '멘티'} · ${row.program.name} — `}{row.reason}</p>
            <p className="text-gray-400">{row.usedAt ? '사용 완료' : ({ PENDING: '승인 대기', APPROVED: '승인됨', REJECTED: '반려됨' }[row.status] || row.status)}{row.reviewNote && ` · ${row.reviewNote}`}</p>
            {reviewer && row.status === 'PENDING' && <div className="flex gap-2 mt-2">
                <button disabled={busy} className="btn-primary text-sm" onClick={() => void submit({ requestId: row.id, status: 'APPROVED' }, 'PATCH')}>승인</button>
                <button disabled={busy} className="btn-secondary text-sm" onClick={() => { const note = window.prompt('반려 사유를 입력하세요.'); if (note !== null) void submit({ requestId: row.id, status: 'REJECTED', reviewNote: note }, 'PATCH'); }}>반려</button>
            </div>}
            {!reviewer && row.status === 'APPROVED' && !row.usedAt && <button className="btn-primary text-sm mt-2" disabled={busy} onClick={() => onCreate?.(row.id)}>승인으로 프로젝트 개설</button>}
        </div>)}
    </section>;
}
