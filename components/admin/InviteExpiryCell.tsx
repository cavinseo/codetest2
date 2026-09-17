'use client';
// 초대 목록의 기한 표시와 날짜 편집·저장·취소 화면을 렌더링한다.
import { formatInviteExpiryDate, getInviteExpiryInputError } from '@/lib/invite-expiry';

interface InviteExpiryCellProps {
    invite: { id: string; email: string; expiresAt: string; programEndsAt: string; usedAt?: string | null; usedById?: string | null; accessExpiresAt?: string | null };
    editState: { value: string; error: string } | null;
    isBusy: boolean;
    isSaving: boolean;
    today: string;
    onStartEditing: () => void;
    onDateChange: (value: string) => void;
    onSave: () => void;
    onCancel: () => void;
}

export default function InviteExpiryCell({
    invite, editState, isBusy, isSaving, today, onStartEditing, onDateChange, onSave, onCancel,
}: InviteExpiryCellProps) {
    const memberAccessExpiresAt = invite.usedAt || invite.usedById ? invite.accessExpiresAt : null;
    const validationError = editState ? getInviteExpiryInputError(editState.value, invite.programEndsAt, memberAccessExpiresAt) : '';
    const maxDate = formatInviteExpiryDate(memberAccessExpiresAt && memberAccessExpiresAt < invite.programEndsAt
        ? memberAccessExpiresAt : invite.programEndsAt);
    const errorMessage = editState?.error || validationError;

    return <td className="px-5 py-4 text-sm text-gray-400">
        {editState ? <div className="space-y-2">
            <input type="date" className="input" value={editState.value} required min={today}
                max={maxDate} disabled={isBusy}
                aria-label={`${invite.email} 최초 접속 기한`}
                onChange={(event) => onDateChange(event.target.value)}
                id={`invites-expiry-input-${invite.id}`} />
            <div className="flex gap-2">
                <button type="button" className="btn-primary text-xs" disabled={isBusy || !!validationError}
                    onClick={onSave} id={`invites-expiry-save-${invite.id}`}>{isSaving ? '저장 중...' : '저장'}</button>
                <button type="button" className="btn-secondary text-xs" disabled={isBusy}
                    onClick={onCancel} id={`invites-expiry-cancel-${invite.id}`}>취소</button>
            </div>
            {errorMessage && <p className="text-xs text-rose-400" role="alert">{errorMessage}</p>}
        </div> : <button type="button" className="text-indigo-300 underline underline-offset-4 disabled:opacity-50" disabled={isBusy}
            aria-label={`${invite.email} 최초 접속 기한 연장`} title="최초 접속 기한 연장"
            onClick={onStartEditing}
            id={`invites-expiry-${invite.id}`}>{formatInviteExpiryDate(invite.expiresAt)}</button>}
    </td>;
}
