'use client';
// 멘티 초대 코드 발행·목록·회수 화면. 관리자와 프로그램 매니저가 함께 쓴다.
//
// 멘토는 여기서 만들지 않는다(정식 등록으로만 들어온다). 코드는 반드시
// 프로그램에 묶인다 — 그 코드로 가입한 멘티는 그 프로그램에만 속하게 된다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { INVITE_BATCH_LIMIT, parseInviteEmails, runInviteBatch, type InviteBatchResult } from '@/lib/invite-batch';
import { formatInviteExpiryDate, inviteExpirySchema } from '@/lib/invite-expiry';

interface Invite {
    id: string;
    code?: string;
    email: string;
    programId: string;
    programName: string;
    programEndsAt: string;
    expiresAt: string;
    accessDurationDays: number;
    usedAt: string | null;
}

interface ProgramOption {
    id: string;
    name: string;
    organization: string;
    endsAt: string;
}

function getExpiryError(value: string, programEndsAt: string) {
    if (!value) return '이용 기한을 입력하세요.';
    if (!inviteExpirySchema.safeParse(value).success) return '올바른 이용 기한 날짜를 입력하세요.';
    if (value < formatInviteExpiryDate(new Date())) return '한국 시간 오늘 이후 날짜를 선택하세요.';
    if (value > formatInviteExpiryDate(programEndsAt)) return '프로그램 종료일 이내 날짜를 선택하세요.';
    return '';
}

export default function InvitesTab() {
    const [invites, setInvites] = useState<Invite[]>([]);
    const [programs, setPrograms] = useState<ProgramOption[]>([]);
    const [email, setEmail] = useState('');
    const [programId, setProgramId] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [editingExpiry, setEditingExpiry] = useState<{ id: string; value: string; error: string } | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [operation, setOperation] = useState<'issue' | 'revoke' | 'resend' | 'extend' | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [results, setResults] = useState<InviteBatchResult[]>([]);
    const [batchTotal, setBatchTotal] = useState(0);
    const mounted = useRef(true);
    const busy = useRef(false);
    const loadRequest = useRef(0);
    const isBusy = operation !== null;
    const parsedEmails = parseInviteEmails(email);
    const selectedProgram = programs.find((program) => program.id === programId);
    const issueExpiryError = selectedProgram ? getExpiryError(expiresAt, selectedProgram.endsAt) : '';
    const editingInvite = invites.find((invite) => invite.id === editingExpiry?.id);
    const editingExpiryError = editingExpiry && editingInvite
        ? editingExpiry.error || getExpiryError(editingExpiry.value, editingInvite.programEndsAt) : '';
    const today = formatInviteExpiryDate(new Date());

    const load = useCallback(async () => {
        const request = ++loadRequest.current;
        const [invitesResult, programsResult] = await Promise.allSettled([
            fetch('/api/invites').then(async (res) => {
                if (!res.ok) throw new Error('초대 코드 목록을 불러오지 못했습니다.');
                return res.json();
            }),
            fetch('/api/programs').then(async (res) => {
                if (!res.ok) throw new Error('프로그램 목록을 불러오지 못했습니다.');
                return res.json();
            }),
        ]);
        if (!mounted.current || request !== loadRequest.current) return;
        const errors: string[] = [];
        if (invitesResult.status === 'fulfilled') {
            setInvites(invitesResult.value.invites);
        } else {
            errors.push('초대 코드 목록을 불러오지 못했습니다.');
        }
        if (programsResult.status === 'fulfilled') {
            const programsData = programsResult.value;
            setPrograms(programsData.programs);
            // 처음 불러왔을 때만 기본값을 채운다. 이미 골라둔 값을 목록이
            // 새로고침될 때마다 되돌리면 발행 중 선택이 날아간다.
            setProgramId((prev) => prev || programsData.programs[0]?.id || '');
        } else {
            errors.push('프로그램 목록을 불러오지 못했습니다.');
        }
        setLoadError(errors.join(' '));
        setIsLoading(false);
    }, []);

    useEffect(() => {
        mounted.current = true;
        void load();
        return () => {
            mounted.current = false;
        };
    }, [load]);

    const issue = async () => {
        const parsed = parseInviteEmails(email);
        if (busy.current || isLoading || !parsed.emails.length || parsed.emails.length > INVITE_BATCH_LIMIT || !selectedProgram || getExpiryError(expiresAt, selectedProgram.endsAt)) return;
        busy.current = true;
        setOperation('issue');
        setMessage(null);
        setResults([]);
        setBatchTotal(parsed.emails.length);
        try {
            const completed = await runInviteBatch(
                parsed.emails.map((address) => ({ kind: 'issue', email: address, programId, expiresAt })),
                (result) => { if (mounted.current) setResults((prev) => [...prev, result]); },
                () => mounted.current,
            );
            if (!mounted.current) return;
            const done = new Set(completed.filter((result) => result.status !== 'failed').map((result) => result.email));
            setEmail([...parsed.invalid, ...parsed.emails.filter((address) => !done.has(address))].join('\n'));
            const sent = completed.filter((result) => result.status === 'sent').length;
            const issued = completed.filter((result) => result.status === 'issued').length;
            const failed = completed.filter((result) => result.status === 'failed').length;
            setMessage({
                type: issued || failed ? 'error' : 'success',
                text: `메일 발송 ${sent}건${issued ? ` · 코드 발급 완료, 메일 미발송 ${issued}건` : ''}${failed ? ` · 실패 ${failed}건` : ''}. 이메일별 결과를 확인하세요.`,
            });
            await load();
        } catch (error) {
            if (mounted.current) setMessage({ type: 'error', text: error instanceof Error ? error.message : '발행에 실패했습니다.' });
        } finally {
            busy.current = false;
            if (mounted.current) setOperation(null);
        }
    };

    const revoke = async (id: string) => {
        if (busy.current) return;
        if (!window.confirm('이 코드를 회수하시겠습니까? 기록은 남습니다.')) return;
        busy.current = true;
        setOperation('revoke');
        try {
            const res = await fetch('/api/invites', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            const data = await res.json().catch(() => null);
            if (!mounted.current) return;
            setMessage(res.ok
                ? { type: 'success', text: '회수했습니다.' }
                : { type: 'error', text: data?.error ?? '회수에 실패했습니다.' });
            await load();
        } catch {
            if (mounted.current) setMessage({ type: 'error', text: '회수 결과를 확인하지 못했습니다. 목록을 새로고침하세요.' });
        } finally {
            busy.current = false;
            if (mounted.current) setOperation(null);
        }
    };

    const resend = async (invite: Invite) => {
        if (busy.current) return;
        busy.current = true;
        setOperation('resend');
        setMessage(null);
        try {
            const res = await fetch(`/api/invites/${invite.id}/send`, { method: 'POST' });
            const data = await res.json().catch(() => null);
            if (!mounted.current) return;
            setMessage(res.ok && data?.emailSent
                ? { type: 'success', text: `${invite.email} 주소로 기존 초대코드를 다시 발송했습니다.` }
                : { type: 'error', text: data?.error || '메일 재발송에 실패했습니다.' });
        } catch {
            if (mounted.current) setMessage({ type: 'error', text: '메일 발송 결과를 확인하지 못했습니다. 연결을 확인하세요.' });
        } finally {
            busy.current = false;
            if (mounted.current) setOperation(null);
        }
    };

    const extendExpiry = async (invite: Invite) => {
        if (busy.current || editingExpiry?.id !== invite.id || getExpiryError(editingExpiry.value, invite.programEndsAt)) return;
        busy.current = true;
        setOperation('extend');
        setMessage(null);
        try {
            const res = await fetch('/api/invites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: invite.id, expiresAt: editingExpiry.value }),
            });
            const data = await res.json().catch(() => null);
            if (!mounted.current) return;
            if (!res.ok || !data?.success || !data?.invite?.expiresAt) {
                setEditingExpiry((prev) => prev && ({ ...prev, error: data?.error || '기한 저장에 실패했습니다.' }));
                return;
            }
            setInvites((prev) => prev.map((item) => item.id === invite.id ? { ...item, expiresAt: data.invite.expiresAt } : item));
            setEditingExpiry(null);
            setMessage({ type: 'success', text: '이용 기한을 연장했습니다.' });
        } catch {
            if (mounted.current) setEditingExpiry((prev) => prev && ({ ...prev, error: '기한 저장 결과를 확인하지 못했습니다. 연결 상태와 초대 목록을 확인하세요.' }));
        } finally {
            busy.current = false;
            if (mounted.current) setOperation(null);
        }
    };

    const isExpired = (invite: Invite) => new Date(invite.expiresAt).getTime() <= Date.now();

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
                        <select className="input mt-2" value={programId} disabled={isBusy || isLoading || !programs.length}
                            onChange={(e) => setProgramId(e.target.value)} id="invites-program">
                            {programs.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} ({p.organization})</option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-sm font-medium text-gray-400">
                        이용 기한 (필수)
                        <input type="date" className="input mt-2" value={expiresAt} required min={today}
                            max={selectedProgram ? formatInviteExpiryDate(selectedProgram.endsAt) : undefined}
                            disabled={isBusy || isLoading || !selectedProgram} onChange={(e) => setExpiresAt(e.target.value)}
                            aria-describedby="invites-expiry-help" id="invites-expires-at" />
                    </label>
                    <button type="button" onClick={issue} disabled={isBusy || isLoading || !parsedEmails.emails.length || parsedEmails.emails.length > INVITE_BATCH_LIMIT || !selectedProgram || !!issueExpiryError}
                        className="btn-primary text-sm disabled:opacity-50" id="invites-issue-submit">
                        {operation === 'issue' ? `처리 중 ${results.length}/${batchTotal}` : `초대 코드 발급·발송 (${parsedEmails.emails.length}명)`}
                    </button>
                </div>
                <p className="text-xs text-gray-500">줄바꿈, 공백, 쉼표 또는 세미콜론으로 구분해 최대 {INVITE_BATCH_LIMIT}명까지 입력하세요. 이메일별로 다른 코드와 개별 메일을 보냅니다.</p>
                <p className="text-xs text-gray-500" id="invites-expiry-help">가입과 로그인은 한국 시간으로 선택한 날짜의 끝까지 가능하며, 프로그램이 먼저 종료되면 그 종료 시각까지 이용할 수 있습니다.</p>
                {issueExpiryError && (expiresAt || parsedEmails.emails.length > 0) && <p className="text-xs text-rose-400" role="alert">{issueExpiryError}</p>}
                {parsedEmails.duplicateCount > 0 && <p className="text-xs text-amber-400">중복 이메일 {parsedEmails.duplicateCount}개를 제외했습니다.</p>}
                {parsedEmails.invalid.length > 0 && <p className="text-xs text-rose-400 break-words" role="alert">잘못된 이메일은 발급에서 제외됩니다. {parsedEmails.invalid.join(', ')}</p>}
                {parsedEmails.emails.length > INVITE_BATCH_LIMIT && <p className="text-xs text-rose-400" role="alert">한 번에 최대 {INVITE_BATCH_LIMIT}명까지 발급할 수 있습니다.</p>}
                {!isLoading && !programs.length && !loadError && <p className="text-sm text-gray-500">초대 코드를 발행하려면 먼저 프로그램을 개설하세요.</p>}
                <p className="text-xs text-gray-500">
                    이 코드로 가입한 멘티는 선택한 프로그램에만 참여할 수 있습니다.
                </p>
            </div>

            {loadError && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{loadError}</div>}

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

            {isLoading ? (
                <div className="card text-center py-16"><p className="text-gray-500 text-sm">초대 정보를 불러오는 중...</p></div>
            ) : invites.length === 0 ? (!loadError && (
                <div className="card text-center py-16">
                    <p className="text-gray-500 text-sm">발행된 초대 코드가 없습니다.</p>
                </div>
            )) : (
                <div className="card overflow-hidden p-0">
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px]">
                        <thead>
                            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
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
                                    <td className="px-5 py-4 text-sm text-white">{invite.email}</td>
                                    <td className="px-5 py-4 text-xs text-gray-300 font-mono whitespace-nowrap">{invite.code ?? '관리자만 열람 가능'}</td>
                                    <td className="px-5 py-4 text-sm text-gray-400">{invite.programName}</td>
                                    <td className="px-5 py-4 text-sm text-gray-400">
                                        {editingExpiry?.id === invite.id ? <div className="space-y-2">
                                            <input type="date" className="input" value={editingExpiry.value} required min={today}
                                                max={formatInviteExpiryDate(invite.programEndsAt)} disabled={isBusy}
                                                aria-label={`${invite.email} 이용 기한`}
                                                onChange={(e) => setEditingExpiry({ id: invite.id, value: e.target.value, error: '' })}
                                                id={`invites-expiry-input-${invite.id}`} />
                                            <div className="flex gap-2">
                                                <button type="button" className="btn-primary text-xs" disabled={isBusy || !!getExpiryError(editingExpiry.value, invite.programEndsAt)}
                                                    onClick={() => extendExpiry(invite)} id={`invites-expiry-save-${invite.id}`}>{operation === 'extend' ? '저장 중...' : '저장'}</button>
                                                <button type="button" className="btn-secondary text-xs" disabled={isBusy}
                                                    onClick={() => setEditingExpiry(null)} id={`invites-expiry-cancel-${invite.id}`}>취소</button>
                                            </div>
                                            {editingExpiryError && <p className="text-xs text-rose-400" role="alert">{editingExpiryError}</p>}
                                        </div> : <button type="button" className="text-indigo-300 underline underline-offset-4 disabled:opacity-50" disabled={isBusy}
                                            aria-label={`${invite.email} 이용 기한 연장`} title="이용 기한 연장"
                                            onClick={() => { if (!busy.current) setEditingExpiry({ id: invite.id, value: formatInviteExpiryDate(invite.expiresAt), error: '' }); }}
                                            id={`invites-expiry-${invite.id}`}>{formatInviteExpiryDate(invite.expiresAt)}</button>}
                                    </td>
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
                                        {!isExpired(invite) && <button type="button" onClick={() => resend(invite)} disabled={isBusy}
                                            className="btn-secondary text-xs mr-2" id={`invites-resend-${invite.id}`}>메일 재발송</button>}
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
