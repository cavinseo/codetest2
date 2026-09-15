'use client';
// 관리자가 프로젝트 소유자와 연관 멘토 변경 영향을 확인한 뒤 이관하는 화면.

import { useEffect, useRef, useState } from 'react';
import type { ProjectTransferPreview } from '@/lib/project-transfer-types';

type Candidate = ProjectTransferPreview['target'];
type Busy = 'candidates' | 'preview' | 'transfer' | null;

function describePerson(person: { name: string | null; email: string } | null) {
    return person ? (person.name ? `${person.name} (${person.email})` : person.email) : '배정 없음';
}

export default function ProjectTransfer({ projectId, onTransferred }: {
    projectId: string;
    onTransferred: () => void | Promise<void>;
}) {
    const endpoint = `/api/admin/projects/${projectId}/transfer`;
    const [open, setOpen] = useState(false);
    const [candidates, setCandidates] = useState<Candidate[] | null>(null);
    const [selected, setSelected] = useState('');
    const [preview, setPreview] = useState<ProjectTransferPreview | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState<Busy>(null);
    const [error, setError] = useState<string | null>(null);
    const [completed, setCompleted] = useState(false);
    const busyRef = useRef<Busy>(null);
    const requestVersion = useRef(0);
    const dialog = useRef<HTMLDialogElement>(null);
    const title = useRef<HTMLHeadingElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (open) {
            dialog.current?.showModal();
            title.current?.focus();
        }
    }, [open]);
    useEffect(() => () => { requestVersion.current += 1; }, [projectId]);

    const close = () => {
        if (busyRef.current === 'transfer') return;
        requestVersion.current += 1;
        busyRef.current = null;
        setBusy(null);
        dialog.current?.close();
        setOpen(false);
        trigger.current?.focus();
    };

    const loadCandidates = async () => {
        if (busyRef.current) return;
        const version = ++requestVersion.current;
        busyRef.current = 'candidates';
        setBusy('candidates');
        setError(null);
        try {
            const res = await fetch(endpoint);
            const data = await res.json().catch(() => null);
            if (version !== requestVersion.current) return;
            if (!res.ok || !data?.candidates) {
                setError(data?.error || '이관 후보를 불러오지 못했습니다.');
                return;
            }
            setCandidates(data.candidates);
        } catch {
            if (version === requestVersion.current) setError('이관 후보를 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.');
        } finally {
            if (version === requestVersion.current) { busyRef.current = null; setBusy(null); }
        }
    };

    const show = () => {
        setCandidates(null);
        setSelected('');
        setPreview(null);
        setConfirmed(false);
        setCompleted(false);
        setOpen(true);
        void loadCandidates();
    };

    const loadPreview = async () => {
        if (!selected || busyRef.current) return;
        const version = ++requestVersion.current;
        busyRef.current = 'preview';
        setBusy('preview');
        setPreview(null);
        setConfirmed(false);
        setError(null);
        try {
            const res = await fetch(`${endpoint}?targetMenteeId=${encodeURIComponent(selected)}`);
            const data = await res.json().catch(() => null);
            if (version !== requestVersion.current) return;
            if (!res.ok || !data?.preview) {
                setError(data?.error || '이관 영향을 불러오지 못했습니다.');
                return;
            }
            setPreview(data.preview);
        } catch {
            if (version === requestVersion.current) setError('이관 영향을 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.');
        } finally {
            if (version === requestVersion.current) { busyRef.current = null; setBusy(null); }
        }
    };

    const transfer = async () => {
        if (!preview || !confirmed || busyRef.current) return;
        const version = ++requestVersion.current;
        busyRef.current = 'transfer';
        setBusy('transfer');
        setError(null);
        let succeeded = false;
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetMenteeId: preview.target.id, previewToken: preview.previewToken, confirmed: true }),
            });
            const data = await res.json().catch(() => null);
            if (version !== requestVersion.current) return;
            if (!res.ok || !data?.success) {
                setPreview(null);
                setConfirmed(false);
                setError(res.status === 409
                    ? `${data?.error || '이관 정보가 변경되었습니다.'} 이관 영향을 다시 확인하세요.`
                    : data?.error || '이관에 실패했습니다. 이관 영향을 다시 확인하세요.');
                return;
            }
            succeeded = true;
            setCompleted(true);
            setPreview(null);
            await onTransferred();
        } catch {
            if (version === requestVersion.current) {
                setPreview(null);
                setConfirmed(false);
                setError(succeeded
                    ? '이관은 완료됐으나 목록을 갱신하지 못했습니다. 화면을 새로고침하세요.'
                    : '이관 결과를 확인하지 못했습니다. 목록을 새로고침해 소유자를 확인한 뒤 다시 시도하세요.');
            }
            return;
        } finally {
            if (version === requestVersion.current) { busyRef.current = null; setBusy(null); }
        }
        if (version === requestVersion.current) close();
    };

    return (
        <>
            <button type="button" ref={trigger} onClick={show}
                className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-colors"
                id={`admin-transfer-project-${projectId}`}>
                멘티 변경
            </button>
            {open && (
                <dialog ref={dialog} aria-labelledby={`project-transfer-title-${projectId}`} aria-describedby={`project-transfer-description-${projectId}`}
                    className="card w-[calc(100%-2rem)] max-w-2xl max-h-[85vh] overflow-y-auto p-6 text-gray-300 backdrop:bg-black/60"
                    onCancel={(event) => { event.preventDefault(); close(); }}>
                    <div className="flex items-start justify-between gap-4">
                        <h2 ref={title} tabIndex={-1} id={`project-transfer-title-${projectId}`} className="text-lg font-semibold text-white">프로젝트 소유권 이관</h2>
                        <button type="button" className="btn-secondary text-sm shrink-0 whitespace-nowrap" onClick={close} disabled={busy === 'transfer'}>닫기</button>
                    </div>
                    <p id={`project-transfer-description-${projectId}`} className="mt-3 text-sm text-gray-400">이 프로젝트를 다른 멘티에게 이전합니다. 대상 멘티와 변경 영향을 확인한 뒤 최종 실행하세요.</p>
                    <div className="mt-5 space-y-3">
                        <label htmlFor={`project-transfer-target-${projectId}`} className="block text-sm">새 소유자 멘티</label>
                        <select id={`project-transfer-target-${projectId}`} className="input w-full text-sm" value={selected}
                            disabled={busy === 'transfer' || candidates === null || candidates.length === 0 || completed}
                            onChange={(event) => {
                                requestVersion.current += 1;
                                busyRef.current = null;
                                setBusy(null);
                                setSelected(event.target.value);
                                setPreview(null);
                                setConfirmed(false);
                                setError(null);
                            }}>
                            <option value="">멘티를 선택하세요</option>
                            {candidates?.map(candidate => <option key={candidate.id} value={candidate.id}>{describePerson(candidate)} · {candidate.program.name}</option>)}
                        </select>
                        {busy === 'candidates' && <p role="status" className="text-sm text-gray-400">이관 후보를 불러오는 중입니다.</p>}
                        {candidates?.length === 0 && <p className="text-sm text-gray-400">이관 가능한 멘티가 없습니다. 승인·이용 기간·프로그램 소속을 확인하세요.</p>}
                        {candidates === null && busy !== 'candidates' && <button type="button" onClick={loadCandidates} className="btn-secondary text-sm">후보 다시 불러오기</button>}
                        <button type="button" onClick={loadPreview} disabled={!selected || !!busy || completed} className="btn-secondary text-sm disabled:opacity-50">
                            {busy === 'preview' ? '영향을 확인하는 중입니다.' : '이관 영향 확인'}
                        </button>
                    </div>
                    {preview && (
                        <div className="mt-5 space-y-4 text-sm">
                            <h3 className="font-semibold text-white">{preview.project.name}</h3>
                            <dl className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 break-words">
                                <div><dt className="text-gray-400">소유자 변경</dt><dd className="mt-1">{describePerson(preview.project.owner)} → {describePerson(preview.target)}</dd></div>
                                <div><dt className="text-gray-400">프로젝트 프로그램 {preview.programChanged ? '변경' : '유지'}</dt><dd className="mt-1">{preview.project.program.name} → {preview.target.program.name}</dd></div>
                                <div><dt className="text-gray-400">원본 멘티 담당 멘토</dt><dd className="mt-1">{describePerson(preview.sourceMentor)}</dd></div>
                                <div><dt className="text-gray-400">대상 멘티 담당 멘토 {preview.mentorChanged ? '변경' : '유지'}</dt><dd className="mt-1">{describePerson(preview.currentTargetMentor)} → {describePerson(preview.nextMentor)}</dd></div>
                            </dl>
                            <p className={preview.mentorChanged ? 'rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200' : 'text-gray-400'}>
                                대상 멘티의 다른 프로젝트 {preview.targetProjectCount}개{preview.mentorChanged
                                    ? '에도 변경된 담당 멘토가 적용됩니다.'
                                    : '의 담당 멘토는 그대로 유지됩니다.'}
                                {!preview.sourceMentor && ' 원본 멘티에게 배정된 멘토가 없어 대상의 기존 멘토를 유지합니다.'}
                            </p>
                            <p className="text-gray-400">프로젝트 ID, 워크시트, 보고서, 의견 및 개설 승인 정보는 보존됩니다. 원본 멘티의 다른 프로젝트와 멘토 배정, 각 멘티의 소속 프로그램은 유지됩니다.</p>
                            <p className="text-gray-400">원래 소유자는 이 프로젝트의 소유자·팀원 접근 권한을 잃습니다. 새 소유자의 중복 팀원 등록은 정리하고 다른 팀원은 유지합니다.</p>
                            <label className="flex items-start gap-3 rounded-lg border border-amber-500/30 p-3">
                                <input type="checkbox" className="mt-1" checked={confirmed} disabled={busy === 'transfer'} onChange={event => setConfirmed(event.target.checked)} />
                                <span>소유자·프로그램·멘토 변경과 다른 프로젝트에 미치는 영향을 확인했으며 이관에 동의합니다.</span>
                            </label>
                            <button type="button" className="btn-primary text-sm disabled:opacity-50" onClick={transfer} disabled={!confirmed || !!busy}>
                                {busy === 'transfer' ? '이관 중입니다.' : '최종 이관 실행'}
                            </button>
                        </div>
                    )}
                    {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
                </dialog>
            )}
        </>
    );
}
