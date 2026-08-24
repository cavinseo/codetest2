'use client';
// 멘티 초대 코드 발행·목록·회수 화면. 관리자와 프로그램 매니저가 함께 쓴다.
//
// 멘토는 여기서 만들지 않는다(정식 등록으로만 들어온다). 코드는 반드시
// 프로그램에 묶인다 — 그 코드로 가입한 멘티는 그 프로그램에만 속하게 된다.

import { useCallback, useEffect, useState } from 'react';

interface Invite {
    id: string;
    code: string;
    email: string;
    programId: string;
    programName: string;
    expiresAt: string;
    accessDurationDays: number;
    usedAt: string | null;
}

interface ProgramOption {
    id: string;
    name: string;
    organization: string;
}

export default function InvitesTab() {
    const [invites, setInvites] = useState<Invite[]>([]);
    const [programs, setPrograms] = useState<ProgramOption[]>([]);
    const [email, setEmail] = useState('');
    const [programId, setProgramId] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    const load = useCallback(async () => {
        const [invitesRes, programsRes] = await Promise.all([
            fetch('/api/invites'),
            fetch('/api/programs'),
        ]);
        if (!invitesRes.ok) {
            setMessage({ type: 'error', text: '초대 코드 목록을 불러오지 못했습니다.' });
            return;
        }
        const invitesData = await invitesRes.json();
        setInvites(invitesData.invites);

        if (programsRes.ok) {
            const programsData = await programsRes.json();
            setPrograms(programsData.programs);
            // 처음 불러왔을 때만 기본값을 채운다. 이미 골라둔 값을 목록이
            // 새로고침될 때마다 되돌리면 발행 중 선택이 날아간다.
            setProgramId((prev) => prev || programsData.programs[0]?.id || '');
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const issue = async () => {
        setIsBusy(true);
        setMessage(null);
        try {
            const res = await fetch('/api/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role: 'MENTEE', programId }),
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

    if (programs.length === 0) {
        return (
            <div className="card text-center py-16">
                <p className="text-gray-500 text-sm">
                    초대 코드를 발행하려면 먼저 프로그램을 개설하세요.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="card space-y-3">
                <h3 className="text-sm font-bold text-white">멘티 초대 코드 발행</h3>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="block text-sm font-medium text-gray-400">
                        이메일
                        <input className="input mt-2" value={email}
                            onChange={(e) => setEmail(e.target.value)} id="invites-email" />
                    </label>
                    <label className="block text-sm font-medium text-gray-400">
                        프로그램
                        <select className="input mt-2" value={programId}
                            onChange={(e) => setProgramId(e.target.value)} id="invites-program">
                            {programs.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} ({p.organization})</option>
                            ))}
                        </select>
                    </label>
                    <button type="button" onClick={issue} disabled={isBusy || !email || !programId}
                        className="btn-primary text-sm disabled:opacity-50" id="invites-issue-submit">
                        초대 코드 발행
                    </button>
                </div>
                <p className="text-xs text-gray-500">
                    이 코드로 가입한 멘티는 선택한 프로그램에만 참여할 수 있습니다.
                </p>
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
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">프로그램</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">기한</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">상태</th>
                                <th className="px-5 py-3.5" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {invites.map((invite) => (
                                <tr key={invite.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-5 py-4 text-sm text-white">{invite.email}</td>
                                    <td className="px-5 py-4 text-sm text-gray-400">{invite.programName}</td>
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
