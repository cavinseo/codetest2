'use client';
// 신청과 심사 상태를 한 화면 계약으로 표시하여 승인 없이 추가 개설하는 혼동을 줄인다.
import { useCallback, useEffect, useState } from 'react';
import { readJsonOrThrow } from '@/lib/client-fetch';

interface ProjectRequest {
    id: string;
    reason: string;
    status: string;
    usedAt: string | null;
    reviewNote: string | null;
    mentee: { name: string | null };
    program: { name: string };
}

const STATUS_LABELS: Record<string, string> = { PENDING: '승인 대기', APPROVED: '승인됨', REJECTED: '반려됨' };

function statusLabel(request: ProjectRequest): string {
    return request.usedAt ? '사용 완료' : (STATUS_LABELS[request.status] || request.status);
}

function errorMessage(cause: unknown, fallback: string): string {
    return cause instanceof Error ? cause.message : fallback;
}

// 신청·심사 요청을 보내고, 실패하면 서버가 준 문구로 던진다. 패널과 생성 창이 같은 규칙을 쓴다.
async function sendProjectRequest(method: 'POST' | 'PATCH', body: object, fallbackError: string): Promise<void> {
    const res = await fetch('/api/project-requests', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    await readJsonOrThrow(res, fallbackError);
}

function ReasonField({ reason, onChange, className }: { reason: string; onChange: (reason: string) => void; className: string }) {
    return <label className={className}>추가 개설 사유<textarea className="input mt-2" rows={2} value={reason} maxLength={2000} onChange={event => onChange(event.target.value)} /></label>;
}

function RequestItem({ request, reviewer, isSubmitting, onReview, onCreate }: {
    request: ProjectRequest;
    reviewer: boolean;
    isSubmitting: boolean;
    onReview: (body: { requestId: string; status: 'APPROVED' | 'REJECTED'; reviewNote?: string }) => void;
    onCreate?: (approvalId: string) => void;
}) {
    const reject = () => {
        const note = window.prompt('반려 사유를 입력하세요.');
        if (note !== null) onReview({ requestId: request.id, status: 'REJECTED', reviewNote: note });
    };
    return <div className="border-t border-white/10 pt-3 text-sm">
        <p>{reviewer && `${request.mentee.name || '멘티'} · ${request.program.name} — `}{request.reason}</p>
        <p className="text-gray-400">{statusLabel(request)}{request.reviewNote && ` · ${request.reviewNote}`}</p>
        {reviewer && request.status === 'PENDING' && <div className="flex gap-2 mt-2">
            <button disabled={isSubmitting} className="btn-primary text-sm" onClick={() => onReview({ requestId: request.id, status: 'APPROVED' })}>승인</button>
            <button disabled={isSubmitting} className="btn-secondary text-sm" onClick={reject}>반려</button>
        </div>}
        {!reviewer && request.status === 'APPROVED' && !request.usedAt
            && <button className="btn-primary text-sm mt-2" disabled={isSubmitting} onClick={() => onCreate?.(request.id)}>승인으로 프로젝트 개설</button>}
    </div>;
}

export default function ProjectRequestsPanel({ reviewer = false, onCreate }: { reviewer?: boolean; onCreate?: (approvalId: string) => void }) {
    const [requests, setRequests] = useState<ProjectRequest[]>([]);
    const [ownedProjectCount, setOwnedProjectCount] = useState(0);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const loadRequests = useCallback(async () => {
        try {
            const res = await fetch('/api/project-requests');
            const data = await readJsonOrThrow(res, '신청 조회 실패');
            setRequests(data.requests);
            setOwnedProjectCount(data.ownedProjectCount || 0);
        } catch (cause) {
            setError(errorMessage(cause, '신청 조회 실패'));
        } finally {
            setLoaded(true);
        }
    }, []);
    useEffect(() => { void loadRequests(); }, [loadRequests]);

    const submit = async (method: 'POST' | 'PATCH', body: object) => {
        setIsSubmitting(true);
        setError('');
        try {
            await sendProjectRequest(method, body, '처리 실패');
            setReason('');
            await loadRequests();
        } catch (cause) {
            setError(errorMessage(cause, '신청 처리 실패'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const pendingCount = requests.filter(request => request.status === 'PENDING').length;
    return <section className="card space-y-3 mb-4">
        <h3 className="font-semibold">추가 프로젝트 개설 {reviewer ? '승인 관리' : '신청'}
            {reviewer && pendingCount > 0 && <span className="ml-2 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs text-rose-400">대기 {pendingCount}건</span>}</h3>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        {/* 빈 카드는 기능이 없는 것으로 오인된다(2026-10-20 사용자 제보) — 신청이 어디서 들어오는지 알려 준다. */}
        {reviewer && loaded && !error && pendingCount === 0 && <p className="text-sm text-gray-400">승인 대기 중인 신청이 없습니다. 프로젝트를 이미 가진 멘티가 대시보드의 「추가 프로젝트 개설 신청」에서 신청하면 여기에 표시됩니다.</p>}
        {!reviewer && <p className="text-sm text-gray-400">프로젝트는 1개까지 직접 개설할 수 있으며, 추가 개설마다 승인이 필요합니다. 현재 {ownedProjectCount}개를 소유하고 있습니다.</p>}
        {!reviewer && ownedProjectCount >= 1 && <form onSubmit={event => { event.preventDefault(); void submit('POST', { reason }); }}>
            <ReasonField reason={reason} onChange={setReason} className="text-sm" />
            <button disabled={isSubmitting || !reason.trim() || pendingCount > 0} className="btn-primary mt-2">승인 신청</button>
        </form>}
        {requests.map(request => <RequestItem
            key={request.id}
            request={request}
            reviewer={reviewer}
            isSubmitting={isSubmitting}
            onReview={body => void submit('PATCH', body)}
            onCreate={onCreate}
        />)}
    </section>;
}

// 생성 창에서 승인 필요로 거절된 멘티가 창을 벗어나지 않고 바로 신청하게 한다.
// 거절 문구만 보여 주면 신청이 접수된 것으로 오인된다(2026-10-20 사용자 제보).
export function ProjectApprovalRequestBox({ defaultReason, onRequested }: { defaultReason: string; onRequested: () => void }) {
    const [reason, setReason] = useState(defaultReason);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submit = async () => {
        setIsSubmitting(true);
        setError('');
        try {
            await sendProjectRequest('POST', { reason }, '신청 처리 실패');
            onRequested();
        } catch (cause) {
            setError(errorMessage(cause, '신청 처리 실패'));
        } finally {
            setIsSubmitting(false);
        }
    };
    return <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-2 text-sm">
        <p>이미 프로젝트를 갖고 있어 추가 개설에는 프로그램 매니저의 승인이 필요합니다. 아래 사유로 승인을 신청하세요. 승인되면 대시보드의 「승인으로 프로젝트 개설」로 만들 수 있습니다.</p>
        {error && <p role="alert" className="text-rose-400">{error}</p>}
        <ReasonField reason={reason} onChange={setReason} className="block" />
        <button type="button" disabled={isSubmitting || !reason.trim()} className="btn-primary" onClick={() => void submit()}>승인 신청</button>
    </div>;
}
