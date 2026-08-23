'use client';
// 초대 코드 발행·목록·회수 화면. 관리자와 프로그램 매니저가 함께 쓴다.

import { useCallback, useEffect, useState } from 'react';
import { MEMBER_ROLE_LABELS } from '@/lib/member-roles';

interface Invite {
    id: string;
    code: string;
    email: string;
    role: 'MENTOR' | 'MENTEE';
    expiresAt: string;
    accessDurationDays: number;
    usedAt: string | null;
}

export default function InvitesTab() {
    const [invites, setInvites] = useState<Invite[]>([]);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<'MENTOR' | 'MENTEE'>('MENTEE');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    const load = useCallback(async () => {
        const res = await fetch('/api/invites');
        if (!res.ok) return;
        const data = await res.json();
        setInvites(data.invites);
    }, []);

    useEffect(() => { load(); }, [load]);

    const issue = async () => {
        setIsBusy(true);
        setMessage(null);
        try {
            const res = await fetch('/api/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || '발행에 실패했습니다.');

            // 메일이 나가지 않았으면 관리자가 직접 전달해야 하므로 코드를 보여준다.
            setMessage({
                type: 'success',
                text: data.emailSent
                    ? '초대 메일을 보냈습니다.'
                    : `메일 발송에 실패했습니다. 코드를 직접 전달하세요. ${data.code}`,
            });
            setEmail('');
            await load();
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : '발행에 실패했습니다.' });
        } finally {
            setIsBusy(false);
        }
    };

    const revoke = async (id: string) => {
        if (!window.confirm('이 코드를 회수하시겠습니까? 기록은 남습니다.')) return;
        const res = await fetch('/api/invites', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        const data = await res.json().catch(() => null);
        setMessage(res.ok
            ? { type: 'success', text: '회수했습니다.' }
            : { type: 'error', text: data?.error ?? '회수에 실패했습니다.' });
        await load();
    };

    const isExpired = (invite: Invite) => new Date(invite.expiresAt).getTime() <= Date.now();

    return (
        <div className="space-y-4">
            <div className="card space-y-3">
                <h3 className="text-sm font-bold text-white">초대 코드 발행</h3>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="block text-sm font-medium text-gray-400">
                        이메일
                        <input className="input mt-2" value={email}
                            onChange={(e) => setEmail(e.target.value)} id="invites-email" />
                    </label>
                    <label className="block text-sm font-medium text-gray-400">
                        역할
                        <select className="input mt-2" value={role}
                            onChange={(e) => setRole(e.target.value as 'MENTOR' | 'MENTEE')} id="invites-role">
                            <option value="MENTEE">{MEMBER_ROLE_LABELS.MENTEE}</option>
                            <option value="MENTOR">{MEMBER_ROLE_LABELS.MENTOR}</option>
                        </select>
                    </label>
                    <button type="button" onClick={issue} disabled={isBusy || !email}
                        className="btn-primary text-sm disabled:opacity-50" id="invites-issue-submit">
                        초대 코드 발행
                    </button>
                </div>
            </div>

            {message && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${message.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                    }`}>
                    {message.text}
                </div>
            )}

            {invites.length === 0 ? (
                <div className="card text-center py-16">
                    <p className="text-gray-500 text-sm">발행된 초대 코드가 없습니다.</p>
                </div>
            ) : (
                <div className="card overflow-hidden p-0">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">이메일</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">역할</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">기한</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">상태</th>
                                <th className="px-5 py-3.5" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {invites.map((invite) => (
                                <tr key={invite.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-5 py-4 text-sm text-white">{invite.email}</td>
                                    <td className="px-5 py-4 text-sm text-gray-400">{MEMBER_ROLE_LABELS[invite.role]}</td>
                                    <td className="px-5 py-4 text-sm text-gray-400">{invite.expiresAt.slice(0, 10)}</td>
                                    <td className="px-5 py-4">
                                        {invite.usedAt ? (
                                            <span className="badge-emerald text-[10px]">사용됨</span>
                                        ) : isExpired(invite) ? (
                                            <span className="badge-rose text-[10px]">만료</span>
                                        ) : (
                                            <span className="badge-amber text-[10px]">대기</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        {!invite.usedAt && !isExpired(invite) && (
                                            <button type="button" onClick={() => revoke(invite.id)}
                                                className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors"
                                                id={`invites-revoke-${invite.id}`}>
                                                회수
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
