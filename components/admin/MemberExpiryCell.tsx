'use client';
// 회원 이용만료일을 클릭해 날짜를 수정하고 저장 결과를 표시한다.
import { useRef, useState } from 'react';
import { formatInviteExpiryDate } from '@/lib/invite-expiry';
import { getMemberAccessExpiryError } from '@/lib/member-access-expiry';

interface MemberExpiryCellProps {
    member: { id: string; email: string; accessExpiresAt: string | null; inviteExpiresAt?: string | null };
    onSaved: () => void;
}

export default function MemberExpiryCell({ member, onSaved }: MemberExpiryCellProps) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const inFlight = useRef(false);
    const validationError = getMemberAccessExpiryError(value, member.inviteExpiresAt);

    const save = async () => {
        if (inFlight.current || validationError) return;
        inFlight.current = true;
        setSaving(true);
        setError('');
        try {
            const response = await fetch('/api/admin/users', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: member.id, action: 'setAccessExpiry', accessExpiresAt: value }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.success || !data?.user?.accessExpiresAt) {
                setError(data?.error || '이용만료일 저장에 실패했습니다.');
                return;
            }
            setEditing(false);
            onSaved();
        } catch {
            setError('저장 결과를 확인하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.');
        } finally {
            inFlight.current = false;
            setSaving(false);
        }
    };

    return <td className="px-5 py-4 text-xs text-gray-500">
        {editing ? <div className="space-y-2">
            <input type="date" className="input" required value={value} disabled={saving}
                min={member.inviteExpiresAt ? formatInviteExpiryDate(member.inviteExpiresAt) : undefined}
                aria-label={`${member.email} 이용만료일`}
                onChange={event => { setValue(event.target.value); setError(''); }} />
            {member.inviteExpiresAt && <p>초대 최초 접속 기한 {formatInviteExpiryDate(member.inviteExpiresAt)} 이후로 설정하세요.</p>}
            <div className="flex gap-2">
                <button type="button" className="btn-primary text-xs" disabled={saving || !!validationError}
                    onClick={save}>{saving ? '저장 중...' : '저장'}</button>
                <button type="button" className="btn-secondary text-xs" disabled={saving}
                    onClick={() => setEditing(false)}>취소</button>
            </div>
            {(error || validationError) && <p className="text-rose-400" role="alert">{error || validationError}</p>}
        </div> : <button type="button" className="text-indigo-300 underline underline-offset-4"
            aria-label={`${member.email} 이용만료일 변경`} title="이용만료일 변경"
            onClick={() => { setValue(member.accessExpiresAt ? formatInviteExpiryDate(member.accessExpiresAt) : ''); setError(''); setEditing(true); }}>
            {member.accessExpiresAt ? formatInviteExpiryDate(member.accessExpiresAt) : '무기한'}
        </button>}
    </td>;
}
