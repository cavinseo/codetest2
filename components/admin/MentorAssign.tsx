'use client';
// 멘티별 단일 멘토 배정·해제. 관리자와 담당 프로그램 매니저가 함께 쓴다.

import { useCallback, useEffect, useState } from 'react';
import { MEMBER_ROLE_LABELS, type MemberRole } from '@/lib/member-roles';
import { requestMentorAssignment } from '@/lib/mentor-assignment-client';

interface Mentor {
    id: string;
    userId: string;
    user: { name: string | null; email: string; role: MemberRole };
}

interface Candidate {
    id: string;
    name: string | null;
    email: string;
    role: MemberRole;
}

export default function MentorAssign({ projectId, menteeId }: { projectId?: string; menteeId?: string }) {
    const endpoint = menteeId ? `/api/mentees/${menteeId}/mentor` : `/api/projects/${projectId}/mentors`;
    const [busy, setBusy] = useState(false);
    const [mentors, setMentors] = useState<Mentor[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [selectedMentorId, setSelectedMentorId] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    // message 는 배정/해제 성공 토스트와 공유되므로 목록 조회 시 지우면 그 토스트가
    // 지워진다. 불러오기 실패는 별도 상태에 담아 매번 갱신될 때 초기화한다.
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadMentorAssignment = useCallback(async () => {
        setLoadError(null);
        // /api/admin/users 는 requireAdmin 이라 매니저는 403 을 받는다. 같은 라우트의
        // ?candidates=1 분기(canAssignMentor 게이트)를 대신 쓴다.
        try {
            const [mentorRes, candidateRes] = await Promise.all([
                fetch(endpoint),
                fetch(`${endpoint}?candidates=1`),
            ]);
            if (mentorRes.ok) {
                setMentors((await mentorRes.json()).mentors);
            } else {
                setLoadError('배정된 멘토 목록을 불러오지 못했습니다.');
            }
            if (candidateRes.ok) {
                setCandidates((await candidateRes.json()).candidates);
            } else {
                setLoadError('배정 가능한 인원을 불러오지 못했습니다.');
            }
        } catch {
            setLoadError('멘토 정보를 불러오지 못했습니다. 연결을 확인하세요.');
        }
    }, [endpoint]);

    useEffect(() => { loadMentorAssignment(); }, [loadMentorAssignment]);

    const assignSelectedMentor = async () => {
        if (mentors.length > 0 && !window.confirm('기존 멘토를 교체하시겠습니까? 이 멘티에 대한 기존 멘토 배정이 해제됩니다.')) return;
        setBusy(true);
        setMessage(null);
        try {
            const result = await requestMentorAssignment(endpoint, selectedMentorId, 'POST');
            setMessage(result.ok
                ? { type: 'success', text: '배정했습니다.' }
                : { type: 'error', text: result.error ?? '배정에 실패했습니다.' });
            setSelectedMentorId('');
            await loadMentorAssignment();
        } catch {
            setMessage({ type: 'error', text: '배정에 실패했습니다. 연결을 확인하세요.' });
        } finally {
            setBusy(false);
        }
    };

    const unassignMentor = async (mentorId: string) => {
        if (!window.confirm('배정을 해제하시겠습니까? 계정은 삭제되지 않습니다.')) return;
        setBusy(true);
        try {
            const result = await requestMentorAssignment(endpoint, mentorId, 'DELETE');
            setMessage(result.ok
                ? { type: 'success', text: '해제했습니다.' }
                : { type: 'error', text: result.error ?? '해제에 실패했습니다.' });
            await loadMentorAssignment();
        } catch {
            setMessage({ type: 'error', text: '해제에 실패했습니다. 연결을 확인하세요.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="card space-y-3">
            <p className="text-sm text-gray-400">한 멘토에게 여러 멘티를 배정할 수 있으며, 멘티당 담당 멘토는 1명입니다. 배정은 해당 멘티의 모든 프로젝트에 적용됩니다.</p>
            <p className="text-sm text-gray-400">프로그램 매니저도 멘토로 참여할 수 있습니다. 멘토로 배정되면 해당 멘티의 프로젝트와 결과보고서를 작성·수정할 수 있습니다.</p>
            <div className="flex flex-wrap items-center gap-2">
                <select className="input w-auto py-2 px-3 text-sm" value={selectedMentorId}
                    disabled={busy} aria-label="배정할 멘토" onChange={(e) => setSelectedMentorId(e.target.value)} id={`mentor-select-${menteeId ?? projectId}`}>
                    <option value="">멘토 선택</option>
                    {candidates.map((c) => (
                        <option key={c.id} value={c.id}>{c.name ?? c.email} ({MEMBER_ROLE_LABELS[c.role]})</option>
                    ))}
                </select>
                <button type="button" onClick={assignSelectedMentor} disabled={!selectedMentorId || busy || !!loadError}
                    className="btn-primary text-sm disabled:opacity-50" id={`mentor-assign-submit-${menteeId ?? projectId}`}>
                    배정
                </button>
            </div>

            {loadError && (
                <p className="text-sm text-rose-300">{loadError}</p>
            )}

            {message && (
                <p className={`text-sm ${message.type === 'success' ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {message.text}
                </p>
            )}

            <ul className="divide-y divide-white/[0.06]">
                {mentors.map((m) => (
                    <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-gray-300">{m.user.name ?? m.user.email}</span>
                        <button type="button" disabled={busy} onClick={() => unassignMentor(m.userId)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors">
                            해제
                        </button>
                    </li>
                ))}
                {mentors.length === 0 && <li className="py-2 text-sm text-gray-500">배정된 멘토가 없습니다.</li>}
            </ul>
        </div>
    );
}
