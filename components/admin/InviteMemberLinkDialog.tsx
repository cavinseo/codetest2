'use client';
// 관리자가 기존 멘티의 신원과 변경 내용을 확인한 뒤 초대 코드에 연결하는 대화상자.

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatInviteExpiryDate } from '@/lib/invite-expiry';

interface LinkPreview {
    inviteId: string;
    email: string;
    member: { id: string; name: string | null; status: 'PENDING' | 'APPROVED'; programName: string | null; accessExpiresAt: string | null };
    program: { id: string; name: string };
    inviteExpiresAt: string;
    accessExpiresAt: string;
    resetPassword: boolean;
    previewToken: string;
}

export default function InviteMemberLinkDialog({ inviteId, onClose, onLinked }: {
    inviteId: string;
    onClose: () => void;
    onLinked: () => void | Promise<void>;
}) {
    const endpoint = `/api/invites/${inviteId}/link`;
    const [preview, setPreview] = useState<LinkPreview | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState<'preview' | 'link' | null>('preview');
    const [error, setError] = useState('');
    const inFlight = useRef<'preview' | 'link' | null>(null);
    const requestVersion = useRef(0);
    const dialog = useRef<HTMLDialogElement>(null);
    const title = useRef<HTMLHeadingElement>(null);

    const loadPreview = useCallback(async () => {
        if (inFlight.current) return;
        const version = ++requestVersion.current;
        inFlight.current = 'preview';
        setBusy('preview');
        setPreview(null);
        setConfirmed(false);
        setError('');
        try {
            const res = await fetch(endpoint);
            const data = await res.json().catch(() => null);
            if (version !== requestVersion.current) return;
            if (!res.ok || !data?.preview) {
                setError(data?.error || '연결할 회원 정보를 불러오지 못했습니다.');
                return;
            }
            setPreview(data.preview);
        } catch {
            if (version === requestVersion.current) setError('연결할 회원 정보를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.');
        } finally {
            if (version === requestVersion.current) { inFlight.current = null; setBusy(null); }
        }
    }, [endpoint]);

    useEffect(() => {
        dialog.current?.showModal();
        title.current?.focus();
        void loadPreview();
        return () => { requestVersion.current += 1; inFlight.current = null; };
    }, [loadPreview]);

    const close = () => {
        if (inFlight.current === 'link') return;
        requestVersion.current += 1;
        dialog.current?.close();
        onClose();
    };

    const linkMember = async () => {
        if (!preview || !confirmed || inFlight.current) return;
        const version = ++requestVersion.current;
        inFlight.current = 'link';
        setBusy('link');
        setError('');
        let succeeded = false;
        try {
            const res = await fetch(endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId: preview.member.id, previewToken: preview.previewToken, confirmIdentity: true }),
            });
            const data = await res.json().catch(() => null);
            if (version !== requestVersion.current) return;
            if (!res.ok || !data?.success) {
                setPreview(null);
                setConfirmed(false);
                setError(`${data?.error || '회원 연결에 실패했습니다.'} 회원 정보를 다시 확인하세요.`);
                return;
            }
            succeeded = true;
            await onLinked();
        } catch {
            if (version === requestVersion.current) {
                setPreview(null);
                setConfirmed(false);
                setError(succeeded
                    ? '회원 연결은 완료됐으나 목록을 갱신하지 못했습니다. 화면을 새로고침하세요.'
                    : '회원 연결 결과를 확인하지 못했습니다. 목록에서 연결 상태를 확인한 뒤 다시 시도하세요.');
            }
        } finally {
            if (version === requestVersion.current) { inFlight.current = null; setBusy(null); }
        }
    };

    return <dialog ref={dialog} aria-labelledby="invite-member-link-title" aria-describedby="invite-member-link-description"
        className="card w-[calc(100%-2rem)] max-w-xl max-h-[85vh] overflow-y-auto p-6 text-gray-300 backdrop:bg-black/60"
        onCancel={(event) => { event.preventDefault(); close(); }}>
        <div className="flex items-start justify-between gap-4">
            <h2 ref={title} tabIndex={-1} id="invite-member-link-title" className="text-lg font-semibold text-white">기존 회원 연결</h2>
            <button type="button" onClick={close} disabled={busy === 'link'} className="btn-secondary text-sm" id="invite-member-link-close">닫기</button>
        </div>
        <p id="invite-member-link-description" className="mt-3 text-sm text-gray-400">직접 가입한 멘티를 이 초대 코드에 연결합니다. 초대 대상자와 기존 회원이 같은 사람인지 확인하세요.</p>
        {busy === 'preview' && <p role="status" className="mt-4 text-sm">연결할 회원 정보를 확인하는 중입니다.</p>}
        {preview && <div className="mt-5 space-y-4 text-sm">
            <dl className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 break-words">
                <div><dt className="text-gray-400">회원</dt><dd>{preview.member.name || '이름 미등록'} · {preview.email}</dd></div>
                <div><dt className="text-gray-400">승인 상태</dt><dd>{preview.member.status === 'PENDING' ? '승인 대기 → 승인' : '승인 유지'}</dd></div>
                <div><dt className="text-gray-400">프로그램</dt><dd>{preview.member.programName || '미배정'} → {preview.program.name}</dd></div>
                <div><dt className="text-gray-400">최초 접속 기한</dt><dd>{formatInviteExpiryDate(preview.inviteExpiresAt)}</dd></div>
                <div><dt className="text-gray-400">회원 이용만료일</dt><dd>{preview.member.accessExpiresAt ? formatInviteExpiryDate(preview.member.accessExpiresAt) : '미설정'} → {formatInviteExpiryDate(preview.accessExpiresAt)}</dd></div>
            </dl>
            <p>회원 정보와 기존 프로젝트·작성 자료를 보존합니다. 연결을 위해 최초 접속 기한을 연장할 필요는 없습니다.</p>
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
                {preview.resetPassword
                    ? '승인 대기 회원의 기존 비밀번호를 무효화하며, 초대 코드로 첫 로그인한 뒤 새 비밀번호를 설정해야 합니다. '
                    : '기존 비밀번호는 유지됩니다. '}
                기존 로그인은 모두 해제됩니다. 멘티가 최초 접속 기한 안에 초대 코드로 로그인해야 다시 이용할 수 있습니다.
            </p>
            <label className="flex items-start gap-3 rounded-lg border border-white/10 p-3">
                <input id="invite-member-link-confirm" type="checkbox" className="mt-1" checked={confirmed} disabled={!!busy}
                    onChange={(event) => setConfirmed(event.target.checked)} />
                <span>초대 대상자와 기존 회원이 같은 사람임을 확인했으며, 위 변경 내용을 확인했습니다.</span>
            </label>
            <button id="invite-member-link-submit" type="button" onClick={linkMember} disabled={!confirmed || !!busy}
                className="btn-primary text-sm disabled:opacity-50">{busy === 'link' ? '연결 중...' : '회원 연결 실행'}</button>
        </div>}
        {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
        {!preview && !busy && <button id="invite-member-link-retry" type="button" className="btn-secondary text-sm mt-4" onClick={loadPreview}>회원 정보 다시 확인</button>}
    </dialog>;
}
