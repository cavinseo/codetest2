'use client';
// 프로젝트가 없는 멘티도 프로그램 소속으로 찾아 멘토를 배정한다.
import { useState } from 'react';
import MentorAssign from './MentorAssign';

export default function ProgramMentors({ programId }: { programId: string }) {
    const [open, setOpen] = useState(false);
    const [mentees, setMentees] = useState<{ id: string; name: string | null; email: string }[]>([]);
    const [selected, setSelected] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const toggle = async () => {
        if (open) { setOpen(false); return; }
        setOpen(true);
        setLoading(true);
        setError('');
        setSelected('');
        try {
            const res = await fetch(`/api/programs/${programId}/mentees`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '멘티 목록을 불러오지 못했습니다.');
            setMentees(data.mentees);
        } catch (err) {
            setError(err instanceof Error ? err.message : '연결을 확인하세요.');
        } finally { setLoading(false); }
    };
    return <div className="mt-3 space-y-3">
        <button type="button" className="btn-secondary text-sm" onClick={toggle}>멘토 배정 {open ? '닫기' : '관리'}</button>
        {open && <>
            {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
            {loading ? <p className="text-sm text-gray-400">멘티를 불러오는 중...</p> : !error && <>
                <select className="input" aria-label="멘토를 배정할 멘티" value={selected} onChange={e => setSelected(e.target.value)}>
                    <option value="">멘티를 선택하세요</option>
                    {mentees.map(m => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
                </select>
                {mentees.length === 0 && <p className="text-sm text-gray-400">프로그램에 소속된 멘티가 없습니다.</p>}
                {selected && <MentorAssign key={selected} menteeId={selected} />}
            </>}
        </>}
    </div>;
}
