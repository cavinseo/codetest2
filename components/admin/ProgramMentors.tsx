'use client';
// 프로그램의 여러 멘티를 한 멘토에게 배정하고 멘티별 배정을 해제한다.
import { useState } from 'react';
import { MEMBER_ROLE_LABELS, type MemberRole } from '@/lib/member-roles';

type Mentor = { id: string; name: string | null; email: string; role: MemberRole };
type Mentee = {
    id: string; name: string | null; email: string;
    mentorAssignment?: { mentorId: string; mentor: { name: string | null; email: string } } | null;
};

export default function ProgramMentors({ programId }: { programId: string }) {
    const [open, setOpen] = useState(false);
    const [mentees, setMentees] = useState<Mentee[]>([]);
    const [candidates, setCandidates] = useState<Mentor[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [mentorId, setMentorId] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [failures, setFailures] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const toggle = async () => {
        if (open) { setOpen(false); return; }
        setOpen(true);
        setLoading(true);
        setError('');
        setMessage('');
        setFailures([]);
        setSelected([]);
        setMentorId('');
        try {
            const res = await fetch(`/api/programs/${programId}/mentees`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '멘티 목록을 불러오지 못했습니다.');
            setMentees(data.mentees);
            if (data.mentees.length > 0) {
                const candidateRes = await fetch(`/api/mentees/${data.mentees[0].id}/mentor?candidates=1`);
                const candidateData = await candidateRes.json();
                if (!candidateRes.ok) throw new Error(candidateData.error || '멘토 목록을 불러오지 못했습니다.');
                setCandidates(candidateData.candidates);
            } else {
                setCandidates([]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '연결을 확인하세요.');
        } finally { setLoading(false); }
    };
    const targets = mentees.filter(m => selected.includes(m.id) && m.mentorAssignment?.mentorId !== mentorId);
    const assign = async () => {
        const mentor = candidates.find(m => m.id === mentorId);
        if (!mentor || targets.length === 0 || busy) return;
        const replacements = targets.filter(m => m.mentorAssignment);
        if (replacements.length > 0 && !window.confirm(`${replacements.map(m => m.name || m.email).join(', ')}의 기존 멘토를 교체하시겠습니까? 선택하지 않은 멘티의 배정은 유지됩니다.`)) return;
        setBusy(true);
        setMessage('');
        setFailures([]);
        const succeeded: string[] = [];
        const failed: string[] = [];
        for (const mentee of targets) {
            try {
                const res = await fetch(`/api/mentees/${mentee.id}/mentor`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: mentor.id }),
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) throw new Error(data?.error || '배정에 실패했습니다.');
                succeeded.push(mentee.id);
                setMentees(rows => rows.map(row => row.id === mentee.id
                    ? { ...row, mentorAssignment: { mentorId: mentor.id, mentor } } : row));
            } catch (err) {
                failed.push(`${mentee.name || mentee.email}: ${err instanceof Error ? err.message : '연결을 확인하세요.'}`);
            }
        }
        setSelected(ids => ids.filter(id => !succeeded.includes(id)));
        setMessage(`${mentor.name || mentor.email} 멘토에게 ${succeeded.length}명을 배정했습니다.`);
        setFailures(failed);
        setBusy(false);
    };
    const unassign = async (mentee: Mentee) => {
        if (!mentee.mentorAssignment || !window.confirm(`${mentee.name || mentee.email}의 멘토 배정을 해제하시겠습니까? 다른 멘티의 배정은 유지됩니다.`)) return;
        setBusy(true);
        setMessage('');
        setFailures([]);
        try {
            const res = await fetch(`/api/mentees/${mentee.id}/mentor`, {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: mentee.mentorAssignment.mentorId }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || '해제에 실패했습니다.');
            setMentees(rows => rows.map(row => row.id === mentee.id ? { ...row, mentorAssignment: null } : row));
            setMessage(`${mentee.name || mentee.email}의 멘토 배정을 해제했습니다.`);
        } catch (err) {
            setFailures([err instanceof Error ? err.message : '연결을 확인하세요.']);
        } finally { setBusy(false); }
    };
    return <div className="mt-3 space-y-3">
        <button type="button" className="btn-secondary text-sm" disabled={loading || busy} onClick={toggle}>멘토 배정 {open ? '닫기' : '관리'}</button>
        {open && <>
            {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
            {loading ? <p className="text-sm text-gray-400">멘토와 멘티를 불러오는 중...</p> : !error && <>
                <p className="text-sm text-gray-400">한 멘토에게 여러 멘티를 배정할 수 있습니다. 멘티당 담당 멘토는 1명이며, 배정은 해당 멘티의 모든 프로젝트에 적용됩니다.</p>
                {mentees.length === 0 ? <p className="text-sm text-gray-400">프로그램에 소속된 멘티가 없습니다.</p> : <>
                    <select className="input" aria-label="여러 멘티에게 배정할 멘토" value={mentorId} disabled={busy} onChange={e => setMentorId(e.target.value)}>
                        <option value="">멘토를 선택하세요</option>
                        {candidates.map(m => <option key={m.id} value={m.id}>{m.name || m.email} ({MEMBER_ROLE_LABELS[m.role]})</option>)}
                    </select>
                    {candidates.length === 0 && <p className="text-sm text-gray-400">배정 가능한 멘토가 없습니다.</p>}
                    <label className="flex items-center gap-2 text-sm text-gray-300">
                        <input type="checkbox" checked={selected.length === mentees.length} disabled={busy}
                            onChange={e => setSelected(e.target.checked ? mentees.map(m => m.id) : [])} />
                        멘티 전체 선택
                    </label>
                    <ul className="divide-y divide-white/[0.06]">
                        {mentees.map(m => <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                            <label className="flex items-center gap-2 text-gray-300">
                                <input type="checkbox" aria-label={`${m.name || m.email} 선택`} checked={selected.includes(m.id)} disabled={busy}
                                    onChange={e => setSelected(ids => e.target.checked ? [...ids, m.id] : ids.filter(id => id !== m.id))} />
                                <span>{m.name || m.email}<span className="ml-2 text-xs text-gray-500">{m.email}</span></span>
                            </label>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400">담당 멘토: {m.mentorAssignment ? m.mentorAssignment.mentor.name || m.mentorAssignment.mentor.email : '미배정'}</span>
                                {m.mentorAssignment && <button type="button" className="text-xs text-rose-400" disabled={busy}
                                    aria-label={`${m.name || m.email} 멘토 배정 해제`} onClick={() => unassign(m)}>해제</button>}
                            </div>
                        </li>)}
                    </ul>
                    <button type="button" className="btn-primary text-sm disabled:opacity-50" disabled={!mentorId || targets.length === 0 || busy} onClick={assign}>
                        {busy ? '배정 처리 중...' : `선택한 ${targets.length}명에게 배정`}
                    </button>
                    {mentorId && selected.length > 0 && targets.length < selected.length && <p className="text-xs text-gray-500">이미 같은 멘토가 배정된 멘티는 유지됩니다.</p>}
                </>}
                {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
                {failures.length > 0 && <div role="alert" className="text-sm text-rose-300">
                    <p>처리하지 못한 항목을 확인한 후 다시 시도하세요.</p>
                    <ul>{failures.map(item => <li key={item}>{item}</li>)}</ul>
                </div>}
            </>}
        </>}
    </div>;
}
