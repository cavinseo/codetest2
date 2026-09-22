'use client';
// 프로그램의 여러 멘티를 한 멘토에게 배정하고 멘티별 배정을 해제한다.
import { useState } from 'react';
import { MEMBER_ROLE_LABELS, type MemberRole } from '@/lib/member-roles';
import { requestMentorAssignment } from '@/lib/mentor-assignment-client';

type Mentor = { id: string; name: string | null; email: string; role: MemberRole };
type Mentee = {
    id: string; name: string | null; email: string;
    mentorAssignment?: { mentorId: string; mentor: { name: string | null; email: string } } | null;
};

export default function ProgramMentors({ programId }: { programId: string }) {
    const [open, setOpen] = useState(false);
    const [mentees, setMentees] = useState<Mentee[]>([]);
    const [candidates, setCandidates] = useState<Mentor[]>([]);
    const [selectedMenteeIds, setSelectedMenteeIds] = useState<string[]>([]);
    const [selectedMentorId, setSelectedMentorId] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [failures, setFailures] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const toggleAssignmentPanel = async () => {
        if (open) { setOpen(false); return; }
        setOpen(true);
        setLoading(true);
        setError('');
        setMessage('');
        setFailures([]);
        setSelectedMenteeIds([]);
        setSelectedMentorId('');
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
    const menteesToAssign = mentees.filter(mentee => selectedMenteeIds.includes(mentee.id) && mentee.mentorAssignment?.mentorId !== selectedMentorId);
    const assignMentorToMentee = async (mentee: Mentee, mentor: Mentor) => {
        const result = await requestMentorAssignment(`/api/mentees/${mentee.id}/mentor`, mentor.id, 'POST');
        if (!result.ok) throw new Error(result.error || '배정에 실패했습니다.');
        setMentees(rows => rows.map(row => row.id === mentee.id
            ? { ...row, mentorAssignment: { mentorId: mentor.id, mentor } } : row));
    };
    const assignSelectedMentees = async () => {
        const mentor = candidates.find(candidate => candidate.id === selectedMentorId);
        if (!mentor || menteesToAssign.length === 0 || busy) return;
        const replacements = menteesToAssign.filter(mentee => mentee.mentorAssignment);
        if (replacements.length > 0 && !window.confirm(`${replacements.map(m => m.name || m.email).join(', ')}의 기존 멘토를 교체하시겠습니까? 선택하지 않은 멘티의 배정은 유지됩니다.`)) return;
        setBusy(true);
        setMessage('');
        setFailures([]);
        const assignedMenteeIds: string[] = [];
        const assignmentErrors: string[] = [];
        for (const mentee of menteesToAssign) {
            try {
                await assignMentorToMentee(mentee, mentor);
                assignedMenteeIds.push(mentee.id);
            } catch (err) {
                assignmentErrors.push(`${mentee.name || mentee.email}: ${err instanceof Error ? err.message : '연결을 확인하세요.'}`);
            }
        }
        setSelectedMenteeIds(ids => ids.filter(id => !assignedMenteeIds.includes(id)));
        setMessage(`${mentor.name || mentor.email} 멘토에게 ${assignedMenteeIds.length}명을 배정했습니다.`);
        setFailures(assignmentErrors);
        setBusy(false);
    };
    const unassignMentor = async (mentee: Mentee) => {
        if (!mentee.mentorAssignment || !window.confirm(`${mentee.name || mentee.email}의 멘토 배정을 해제하시겠습니까? 다른 멘티의 배정은 유지됩니다.`)) return;
        setBusy(true);
        setMessage('');
        setFailures([]);
        try {
            const result = await requestMentorAssignment(`/api/mentees/${mentee.id}/mentor`, mentee.mentorAssignment.mentorId, 'DELETE');
            if (!result.ok) throw new Error(result.error || '해제에 실패했습니다.');
            setMentees(rows => rows.map(row => row.id === mentee.id ? { ...row, mentorAssignment: null } : row));
            setMessage(`${mentee.name || mentee.email}의 멘토 배정을 해제했습니다.`);
        } catch (err) {
            setFailures([err instanceof Error ? err.message : '연결을 확인하세요.']);
        } finally { setBusy(false); }
    };
    return <div className="mt-3 space-y-3">
        <button type="button" className="btn-secondary text-sm" disabled={loading || busy} onClick={toggleAssignmentPanel}>멘토 배정 {open ? '닫기' : '관리'}</button>
        {open && <>
            {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
            {loading ? <p className="text-sm text-gray-400">멘토와 멘티를 불러오는 중...</p> : !error && <>
                <p className="text-sm text-gray-400">한 멘토에게 여러 멘티를 배정할 수 있습니다. 멘티당 담당 멘토는 1명이며, 배정은 해당 멘티의 모든 프로젝트에 적용됩니다.</p>
                <p className="text-sm text-gray-400">프로그램 매니저도 본인을 멘토로 배정할 수 있습니다. 배정된 멘티의 프로젝트와 결과보고서를 작성·수정할 수 있습니다.</p>
                {mentees.length === 0 ? <p className="text-sm text-gray-400">프로그램에 소속된 멘티가 없습니다.</p> : <>
                    <select className="input" aria-label="여러 멘티에게 배정할 멘토" value={selectedMentorId} disabled={busy} onChange={e => setSelectedMentorId(e.target.value)}>
                        <option value="">멘토를 선택하세요</option>
                        {candidates.map(m => <option key={m.id} value={m.id}>{m.name || m.email} ({MEMBER_ROLE_LABELS[m.role]})</option>)}
                    </select>
                    {candidates.length === 0 && <p className="text-sm text-gray-400">배정 가능한 멘토가 없습니다.</p>}
                    <label className="flex items-center gap-2 text-sm text-gray-300">
                        <input type="checkbox" checked={selectedMenteeIds.length === mentees.length} disabled={busy}
                            onChange={e => setSelectedMenteeIds(e.target.checked ? mentees.map(m => m.id) : [])} />
                        멘티 전체 선택
                    </label>
                    <ul className="divide-y divide-white/[0.06]">
                        {mentees.map(m => <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                            <label className="flex items-center gap-2 text-gray-300">
                                <input type="checkbox" aria-label={`${m.name || m.email} 선택`} checked={selectedMenteeIds.includes(m.id)} disabled={busy}
                                    onChange={e => setSelectedMenteeIds(ids => e.target.checked ? [...ids, m.id] : ids.filter(id => id !== m.id))} />
                                <span>{m.name || m.email}<span className="ml-2 text-xs text-gray-500">{m.email}</span></span>
                            </label>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400">담당 멘토: {m.mentorAssignment ? m.mentorAssignment.mentor.name || m.mentorAssignment.mentor.email : '미배정'}</span>
                                {m.mentorAssignment && <button type="button" className="text-xs text-rose-400" disabled={busy}
                                    aria-label={`${m.name || m.email} 멘토 배정 해제`} onClick={() => unassignMentor(m)}>해제</button>}
                            </div>
                        </li>)}
                    </ul>
                    <button type="button" className="btn-primary text-sm disabled:opacity-50" disabled={!selectedMentorId || menteesToAssign.length === 0 || busy} onClick={assignSelectedMentees}>
                        {busy ? '배정 처리 중...' : `선택한 ${menteesToAssign.length}명에게 배정`}
                    </button>
                    {selectedMentorId && selectedMenteeIds.length > 0 && menteesToAssign.length < selectedMenteeIds.length && <p className="text-xs text-gray-500">이미 같은 멘토가 배정된 멘티는 유지됩니다.</p>}
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
