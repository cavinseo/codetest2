'use client';
// 프로젝트별 멘토 배정·해제. 관리자와 프로그램 매니저가 함께 쓴다.

import { useCallback, useEffect, useState } from 'react';
import { MEMBER_ROLE_LABELS, type MemberRole } from '@/lib/member-roles';

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

export default function MentorAssign({ projectId }: { projectId: string }) {
    const [mentors, setMentors] = useState<Mentor[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [selected, setSelected] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const load = useCallback(async () => {
        const [mentorRes, userRes] = await Promise.all([
            fetch(`/api/projects/${projectId}/mentors`),
            fetch('/api/admin/users'),
        ]);
        if (mentorRes.ok) setMentors((await mentorRes.json()).mentors);
        if (userRes.ok) {
            const users: Candidate[] = (await userRes.json()).users;
            // 매니저는 멘토에서 승격되므로 겸직 대상이다.
            setCandidates(users.filter((u) => u.role === 'MENTOR' || u.role === 'PROGRAM_MANAGER'));
        }
    }, [projectId]);

    useEffect(() => { load(); }, [load]);

    const assign = async () => {
        setMessage(null);
        const res = await fetch(`/api/projects/${projectId}/mentors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: selected }),
        });
        const data = await res.json().catch(() => null);
        setMessage(res.ok
            ? { type: 'success', text: '배정했습니다.' }
            : { type: 'error', text: data?.error ?? '배정에 실패했습니다.' });
        setSelected('');
        await load();
    };

    const unassign = async (userId: string) => {
        if (!window.confirm('배정을 해제하시겠습니까? 계정은 삭제되지 않습니다.')) return;
        const res = await fetch(`/api/projects/${projectId}/mentors`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
        });
        const data = await res.json().catch(() => null);
        setMessage(res.ok
            ? { type: 'success', text: '해제했습니다.' }
            : { type: 'error', text: data?.error ?? '해제에 실패했습니다.' });
        await load();
    };

    return (
        <div className="card space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <select className="input w-auto py-2 px-3 text-sm" value={selected}
                    onChange={(e) => setSelected(e.target.value)} id={`mentor-select-${projectId}`}>
                    <option value="">멘토 선택</option>
                    {candidates.map((c) => (
                        <option key={c.id} value={c.id}>{c.name ?? c.email} ({MEMBER_ROLE_LABELS[c.role]})</option>
                    ))}
                </select>
                <button type="button" onClick={assign} disabled={!selected}
                    className="btn-primary text-sm disabled:opacity-50" id={`mentor-assign-submit-${projectId}`}>
                    배정
                </button>
            </div>

            {message && (
                <p className={`text-sm ${message.type === 'success' ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {message.text}
                </p>
            )}

            <ul className="divide-y divide-white/[0.06]">
                {mentors.map((m) => (
                    <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-gray-300">{m.user.name ?? m.user.email}</span>
                        <button type="button" onClick={() => unassign(m.userId)}
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
