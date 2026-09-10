'use client';
// 멘티 초대 코드 발행·목록·회수 화면. 관리자와 프로그램 매니저가 함께 쓴다.
//
// 멘토는 여기서 만들지 않는다(정식 등록으로만 들어온다). 코드는 반드시
// 프로그램에 묶인다 — 그 코드로 가입한 멘티는 그 프로그램에만 속하게 된다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { INVITE_BATCH_LIMIT, parseInviteEmails, runInviteBatch, type InviteBatchAction, type InviteBatchResult } from '@/lib/invite-batch';

interface Invite {
    id: string;
    code: string;
    email: string;
    role: string;
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
    const [isLoading, setIsLoading] = useState(true);
    const [selected, setSelected] = useState<string[]>([]);
    const [results, setResults] = useState<InviteBatchResult[]>([]);
    const [batchTotal, setBatchTotal] = useState(0);
    const mounted = useRef(true);
    const parsedEmails = parseInviteEmails(email);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const load = useCallback(async () => {
        try {
            const [invitesRes, programsRes] = await Promise.all([
                fetch('/api/invites'),
                fetch('/api/programs'),
            ]);
            if (!invitesRes.ok) throw new Error('초대 코드 목록을 불러오지 못했습니다.');
            if (!programsRes.ok) throw new Error('프로그램 목록을 불러오지 못했습니다.');
            const invitesData = await invitesRes.json();
            const programsData = await programsRes.json();
            if (!mounted.current) return;
            setInvites(invitesData.invites);
            setSelected(prev => prev.filter(id => invitesData.invites.some((invite: Invite) => invite.id === id && invite.role === 'MENTEE' && new Date(invite.expiresAt).getTime() > Date.now())));
            setPrograms(programsData.programs);
            setProgramId(prev => programsData.programs.some((program: ProgramOption) => program.id === prev) ? prev : programsData.programs[0]?.id || '');
        } catch (error) {
            if (mounted.current) setMessage({ type: 'error', text: error instanceof Error ? error.message : '초대 목록을 불러오지 못했습니다. 연결 상태를 확인하세요.' });
        } finally {
            if (mounted.current) setIsLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const processBatch = async (actions: InviteBatchAction[]) => {
        if (isBusy || actions.length === 0) return [];
        setIsBusy(true);
        setMessage(null);
        setResults([]);
        setBatchTotal(actions.length);
        try {
            const completed = await runInviteBatch(actions, result => {
                if (mounted.current) setResults(prev => [...prev, result]);
            }, () => mounted.current);
            if (mounted.current) {
                const sent = completed.filter(result => result.status === 'sent').length;
                const issued = completed.filter(result => result.status === 'issued').length;
                const failed = completed.filter(result => result.status === 'failed').length;
                setMessage({ type: issued || failed ? 'error' : 'success',
                    text: `메일 발송 ${sent}건${issued ? ` · 코드 발급 완료, 메일 미발송 ${issued}건` : ''}${failed ? ` · 실패 ${failed}건` : ''}. 이메일별 결과를 확인하세요.`,
                });
                await load();
            }
            return completed;
        } catch (error) {
            if (mounted.current) setMessage({ type: 'error', text: error instanceof Error ? error.message : '초대 처리에 실패했습니다.' });
            return [];
        } finally {
            if (mounted.current) setIsBusy(false);
        }
    };

    const issue = async () => {
        const parsed = parseInviteEmails(email);
        const completed = await processBatch(parsed.emails.map(address => ({ kind: 'issue', email: address, programId })));
        if (mounted.current && completed.length) {
            const done = new Set(completed.filter(result => result.status !== 'failed').map(result => result.email));
            setEmail([...parsed.invalid, ...parsed.emails.filter(address => !done.has(address))].join('\n'));
        }
    };

    const sendInvites = (targets: Invite[]) => processBatch(targets.map(invite => ({ kind: 'send', email: invite.email, id: invite.id })));

    const revoke = async (id: string) => {
        if (isBusy) return;
        if (!window.confirm('이 코드를 회수하시겠습니까? 기록은 남습니다.')) return;
        setIsBusy(true);
        try {
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
        } catch {
            setMessage({ type: 'error', text: '회수 결과를 확인하지 못했습니다. 목록을 새로고침하세요.' });
        } finally {
            if (mounted.current) setIsBusy(false);
        }
    };

    const isExpired = (invite: Invite) => new Date(invite.expiresAt).getTime() <= Date.now();
    const sendable = invites.filter(invite => invite.role === 'MENTEE' && !isExpired(invite));
    const selectedInvites = sendable.filter(invite => selected.includes(invite.id));

    if (isLoading || programs.length === 0) {
        return (
            <div className="card text-center py-16">
                <p className="text-gray-500 text-sm">
                    {isLoading ? '초대 정보를 불러오는 중...' : message?.text || '초대 코드를 발행하려면 먼저 프로그램을 개설하세요.'}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="card space-y-3">
                <h3 className="text-sm font-bold text-white">멘티 초대 코드 발행</h3>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="block text-sm font-medium text-gray-400 flex-1 min-w-[240px]">
                        초대할 이메일
                        <textarea className="input mt-2 min-h-[110px]" value={email} rows={4} disabled={isBusy}
                            placeholder={'mentee1@example.com\nmentee2@example.com'}
                            onChange={(e) => setEmail(e.target.value)} id="invites-email" />
                    </label>
                    <label className="block text-sm font-medium text-gray-400">
                        프로그램
                        <select className="input mt-2" value={programId} disabled={isBusy}
                            onChange={(e) => setProgramId(e.target.value)} id="invites-program">
                            {programs.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} ({p.organization})</option>
                            ))}
                        </select>
                    </label>
                    <button type="button" onClick={issue} disabled={isBusy || !parsedEmails.emails.length || parsedEmails.emails.length > INVITE_BATCH_LIMIT || !programId}
                        className="btn-primary text-sm disabled:opacity-50" id="invites-issue-submit">
                        {isBusy ? `처리 중 ${results.length}/${batchTotal}` : `초대 코드 발급·발송 (${parsedEmails.emails.length}명)`}
                    </button>
                </div>
                <p className="text-xs text-gray-500">줄바꿈, 쉼표 또는 세미콜론으로 구분해 최대 {INVITE_BATCH_LIMIT}명까지 입력하세요. 이메일별로 다른 코드와 개별 메일을 보냅니다.</p>
                {parsedEmails.duplicateCount > 0 && <p className="text-xs text-amber-400">중복 이메일 {parsedEmails.duplicateCount}개를 제외했습니다.</p>}
                {parsedEmails.invalid.length > 0 && <p className="text-xs text-rose-400 break-words" role="alert">잘못된 이메일은 발급에서 제외됩니다. {parsedEmails.invalid.join(', ')}</p>}
                {parsedEmails.emails.length > INVITE_BATCH_LIMIT && <p className="text-xs text-rose-400" role="alert">한 번에 최대 {INVITE_BATCH_LIMIT}명까지 발급할 수 있습니다.</p>}
                <p className="text-xs text-gray-500">
                    멘티별 이메일과 개인 코드로 로그인합니다. 최초 로그인 후 90일과 프로그램 종료 중 빠른 시점에 만료됩니다.
                </p>
            </div>

            {message && (
                <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${message.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                    }`}>
                    {message.text}
                </div>
            )}

            {results.length > 0 && <div className="card space-y-3" aria-live="polite">
                <h3 className="text-sm font-bold text-white">처리 결과 ({results.length}/{batchTotal})</h3>
                <ul className="space-y-2 text-sm">
                    {results.map((result, index) => <li key={`${result.email}-${index}`} className="flex flex-wrap gap-x-3 gap-y-1 break-all">
                        <span className="text-white">{result.email}</span>
                        <span className={result.status === 'sent' ? 'text-emerald-400' : 'text-rose-400'}>{result.message}</span>
                        {result.code && <code className="text-gray-300">{result.code}</code>}
                    </li>)}
                </ul>
            </div>}

            {invites.length === 0 ? (
                <div className="card text-center py-16">
                    <p className="text-gray-500 text-sm">발행된 초대 코드가 없습니다.</p>
                </div>
            ) : (
                <div className="card overflow-hidden p-0">
                    <div className="p-4 flex flex-wrap items-center gap-3 border-b border-white/[0.06]">
                        <button type="button" className="btn-primary text-sm disabled:opacity-50"
                            onClick={() => sendInvites(selectedInvites)} disabled={isBusy || !selectedInvites.length || selectedInvites.length > INVITE_BATCH_LIMIT}>
                            선택 이메일로 코드 발송 ({selectedInvites.length}명)
                        </button>
                        <p className="text-xs text-gray-500">기존 코드를 등록된 이메일로 발송합니다. 이용 기한은 유지됩니다.</p>
                        {selectedInvites.length > INVITE_BATCH_LIMIT && <p className="text-xs text-rose-400" role="alert">최대 {INVITE_BATCH_LIMIT}명씩 선택하세요.</p>}
                    </div>
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px]">
                        <thead>
                            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                                <th className="px-4 py-3.5"><input type="checkbox" aria-label="발송 가능한 이메일 전체 선택" disabled={isBusy || !sendable.length}
                                    checked={sendable.length > 0 && sendable.every(invite => selected.includes(invite.id))}
                                    onChange={e => setSelected(e.target.checked ? sendable.map(invite => invite.id) : [])} /></th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">이메일</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500">초대코드</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">프로그램</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">기한</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">상태</th>
                                <th className="px-5 py-3.5" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {invites.map((invite) => (
                                <tr key={invite.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-4 py-4"><input type="checkbox" aria-label={`${invite.email} 선택`}
                                        disabled={isBusy || invite.role !== 'MENTEE' || isExpired(invite)} checked={selected.includes(invite.id)}
                                        onChange={e => setSelected(prev => e.target.checked ? [...prev, invite.id] : prev.filter(id => id !== invite.id))} /></td>
                                    <td className="px-5 py-4 text-sm text-white">{invite.email}</td>
                                    <td className="px-5 py-4 text-xs text-gray-300 font-mono whitespace-nowrap">{invite.code}</td>
                                    <td className="px-5 py-4 text-sm text-gray-400">{invite.programName}</td>
                                    <td className="px-5 py-4 text-sm text-gray-400">{invite.expiresAt.slice(0, 10)}</td>
                                    <td className="px-5 py-4">
                                        {isExpired(invite) ? (
                                            <span className="badge-rose text-[10px]">만료</span>
                                        ) : invite.usedAt ? (
                                            <span className="badge-emerald text-[10px]">이용 중</span>
                                        ) : (
                                            <span className="badge-amber text-[10px]">대기</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-right whitespace-nowrap">
                                        {invite.role === 'MENTEE' && !isExpired(invite) && <button type="button" onClick={() => sendInvites([invite])} disabled={isBusy}
                                            className="btn-secondary text-xs mr-2 disabled:opacity-50" aria-label={`${invite.email} 코드 메일 발송`}>
                                            메일 발송
                                        </button>}
                                        {!invite.usedAt && !isExpired(invite) && (
                                            <button type="button" onClick={() => revoke(invite.id)} disabled={isBusy}
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
                </div>
            )}
        </div>
    );
}
