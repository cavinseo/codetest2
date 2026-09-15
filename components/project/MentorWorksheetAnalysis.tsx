'use client';
// 배정 멘토가 워크시트별 비공개 분석을 저장하고 결과보고서에 연결한다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    ANALYSIS_WORKSHEETS, appendTargetSpecItems, emptyWorksheetAnalysis, isAnalysisWorksheetId,
    type AnalysisWorksheetId, type WorksheetAnalysis,
} from '@/lib/mentor-worksheet-analysis';

type AnalysisValue = NonNullable<WorksheetAnalysis[AnalysisWorksheetId]>;
interface Props { projectId: string; worksheetId?: string; onDirtyChange?: (dirty: boolean) => void; }

export default function MentorWorksheetAnalysis({ projectId, worksheetId, onDirtyChange }: Props) {
    const pathname = usePathname();
    const suffix = pathname.slice(`/project/${projectId}/`.length);
    const id = worksheetId ?? (suffix === 'attributes/fitness' ? 'fitness' : suffix);
    if (!isAnalysisWorksheetId(id)) return null;
    return <AnalysisForm key={`${projectId}-${id}`} projectId={projectId} id={id} onDirtyChange={onDirtyChange} />;
}

function AnalysisForm({ projectId, id, onDirtyChange }: { projectId: string; id: AnalysisWorksheetId; onDirtyChange?: Props['onDirtyChange'] }) {
    const url = `/api/projects/${projectId}/report?worksheetId=${encodeURIComponent(id)}`;
    const [canEdit, setCanEdit] = useState(false);
    const [canRead, setCanRead] = useState(false);
    const [value, setValue] = useState<AnalysisValue>(() => emptyWorksheetAnalysis(id));
    const [version, setVersion] = useState(0);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [confirmBack, setConfirmBack] = useState(false);
    const backDialog = useRef<HTMLDialogElement>(null);
    const allowNextPop = useRef(false);
    const generation = useRef(0);
    const saving = useRef(false);
    const load = useCallback(async () => {
        const current = ++generation.current;
        setBusy(true);
        try {
            const response = await fetch(url, { cache: 'no-store' });
            const data = await response.json();
            if (current !== generation.current) return;
            if (!response.ok) throw new Error(data.error || '멘토 분석을 불러오지 못했습니다.');
            setCanEdit(data.canEdit);
            setCanRead(data.canRead ?? data.canEdit);
            setValue(data.analysis ?? emptyWorksheetAnalysis(id));
            setVersion(data.version ?? 0);
            setDirty(false); setError(''); setNotice('');
        } catch (cause) {
            if (current === generation.current) setError(cause instanceof Error ? cause.message : '멘토 분석 조회 실패');
        } finally { if (current === generation.current) setBusy(false); }
    }, [url, id]);
    useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);
    useEffect(() => { onDirtyChange?.(dirty); return () => { onDirtyChange?.(false); }; }, [dirty, onDirtyChange]);
    useEffect(() => {
        if (confirmBack && backDialog.current && !backDialog.current.open) backDialog.current.showModal();
    }, [confirmBack]);
    useEffect(() => {
        if (!dirty) return;
        const currentUrl = window.location.href;
        const currentHistory = window.history.state;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        const guardBack = (event: PopStateEvent) => {
            if (allowNextPop.current) { allowNextPop.current = false; return; }
            event.stopImmediatePropagation();
            window.history.pushState(currentHistory, '', currentUrl);
            setConfirmBack(true);
        };
        const guardLink = (event: MouseEvent) => {
            if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
            if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download') || link.target === '_blank') return;
            if (link.href === window.location.href) return;
            if (!window.confirm('저장하지 않은 멘토 분석이 있습니다. 저장하지 않고 이동할까요?')) {
                event.preventDefault(); event.stopImmediatePropagation();
            }
        };
        window.addEventListener('beforeunload', warn);
        window.addEventListener('popstate', guardBack, true);
        document.addEventListener('click', guardLink, true);
        return () => {
            window.removeEventListener('beforeunload', warn);
            window.removeEventListener('popstate', guardBack, true);
            document.removeEventListener('click', guardLink, true);
        };
    }, [dirty]);

    const update = (next: AnalysisValue) => { setValue(next); setDirty(true); setNotice(''); };
    const save = async () => {
        if (saving.current) return;
        saving.current = true; setBusy(true); setError(''); setNotice('');
        try {
            const response = await fetch(`/api/projects/${projectId}/report`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version, worksheetId: id, analysis: value }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(response.status === 409
                ? '다른 화면에서 분석 또는 보고서를 변경했습니다. 현재 입력은 유지됩니다. 필요한 내용을 복사한 후 저장본을 다시 불러와 주세요.'
                : data.error || '멘토 분석을 저장하지 못했습니다.');
            setVersion(data.version); setDirty(false);
            setNotice('분석을 저장했습니다. 결과보고서에서 미리보기를 다시 만들면 반영됩니다.');
        } catch (cause) { setError(cause instanceof Error ? cause.message : '멘토 분석 저장 실패'); }
        finally { saving.current = false; setBusy(false); }
    };
    const importSpecItems = async () => {
        if (!('items' in value)) return;
        setBusy(true); setError('');
        try {
            const response = await fetch(`/api/projects/${projectId}/target-spec`, { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '최종 목표 스펙을 불러오지 못했습니다.');
            const items = appendTargetSpecItems(value.items, data.rows?.length ? data.rows : data.asIsRows ?? []);
            if (items.length > 500) throw new Error('설명 항목은 최대 500개까지 저장할 수 있습니다. 기존 항목을 정리한 뒤 불러와 주세요.');
            update({ items });
            setNotice('최신 스펙 항목을 추가했습니다. 기존 설명은 유지되며, 변경되거나 삭제된 항목은 직접 확인해 주세요.');
        } catch (cause) { setError(cause instanceof Error ? cause.message : '스펙 조회 실패'); }
        finally { setBusy(false); }
    };
    if (!canRead) return error ? <p role="alert" className="mx-auto max-w-[1800px] p-4 text-sm text-rose-400">{error}</p> : null;
    const field = (label: string, text: string, onChange: (text: string) => void, maxLength = 20_000) => (
        <label className="block text-sm text-gray-300">{label}
            <textarea className="input mt-2 w-full" rows={4} maxLength={maxLength} value={text} readOnly={!canEdit} onChange={event => onChange(event.target.value)} />
        </label>
    );
    return <section aria-label={`${ANALYSIS_WORKSHEETS[id]} 멘토 분석`} className="card mx-auto my-6 w-full max-w-[1800px] space-y-4">
        {confirmBack && <dialog ref={backDialog} aria-label="저장하지 않은 멘토 분석" onCancel={() => setConfirmBack(false)} className="rounded-xl border border-white/10 bg-surface-900 p-6 text-gray-200 backdrop:bg-black/60">
            <h3 className="font-semibold">저장하지 않은 멘토 분석이 있습니다.</h3>
            <p className="my-4 text-sm">이동하면 아직 저장하지 않은 내용이 사라집니다.</p>
            <div className="flex gap-3">
                <button type="button" className="btn-primary" onClick={() => setConfirmBack(false)}>계속 작성</button>
                <button type="button" className="btn-secondary" onClick={() => { setConfirmBack(false); allowNextPop.current = true; window.history.back(); }}>저장하지 않고 이동</button>
            </div>
        </dialog>}
        <div>
            <h2 className="font-semibold text-white">멘토 분석(보고) · {ANALYSIS_WORKSHEETS[id]}</h2>
            <p className="mt-1 text-sm text-gray-400">배정 멘토가 작성하며 관리자는 초안을 열람할 수 있습니다. 결과보고서를 완료하면 이 분석이 포함된 완료본을 멘티가 열람할 수 있습니다.</p>
            {!canEdit && <p className="mt-1 text-sm text-primary-300">관리자 열람 전용입니다. 작성·저장·완료는 배정 멘토만 가능합니다.</p>}
        </div>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        {notice && <p role="status" className="text-sm text-primary-300">{notice}</p>}
        <fieldset disabled={busy} className="min-w-0 space-y-4">
            {'analysis' in value && field('분석 내용', value.analysis, analysis => update({ analysis }))}
            {'productName' in value && <>
                {field('개선 제품(서비스)명', value.productName, productName => update({ ...value, productName }), 300)}
                {field('개선 제품 설명', value.description, description => update({ ...value, description }))}
            </>}
            {'core' in value && <>
                {field('핵심자산 분석', value.core, core => update({ ...value, core }))}
                {field('보완자산 분석', value.complementary, complementary => update({ ...value, complementary }))}
            </>}
            {'items' in value && <>
                {canEdit && <><p className="text-sm text-gray-400">최종 목표 스펙을 저장한 뒤 항목을 불러오세요. 항목명과 설명은 분석에 별도로 보관됩니다.</p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary text-sm" onClick={() => void importSpecItems()}>WS-12 항목 불러오기</button>
                    <button type="button" className="btn-secondary text-sm" disabled={value.items.length >= 500} onClick={() => update({ items: [...value.items, { label: '', explanation: '' }] })}>설명 항목 추가</button>
                </div></>}
                {!canEdit && value.items.length === 0 && <p className="text-sm text-gray-400">저장된 항목별 설명이 없습니다.</p>}
                {value.items.map((item, index) => <div key={index} className="space-y-2 rounded-lg border border-white/10 p-3">
                    {field(`항목 ${index + 1}`, item.label, label => update({ items: value.items.map((row, i) => i === index ? { ...row, label } : row) }), 2000)}
                    {field(`항목 ${index + 1} 설명`, item.explanation, explanation => update({ items: value.items.map((row, i) => i === index ? { ...row, explanation } : row) }))}
                    {canEdit && <button type="button" className="text-sm text-rose-400" onClick={() => {
                        if ((item.label || item.explanation) && !window.confirm('이 항목과 설명을 삭제할까요?')) return;
                        update({ items: value.items.filter((_, i) => i !== index) });
                    }}>항목 삭제</button>}
                </div>)}
            </>}
            <div className="flex flex-wrap items-center gap-3">
                {canEdit && <button type="button" className="btn-primary" disabled={!dirty} onClick={() => void save()}>{busy ? '처리 중…' : '멘토 분석 저장'}</button>}
                <button type="button" className="btn-secondary" onClick={() => {
                    if (!dirty || window.confirm('저장하지 않은 분석을 버리고 저장본을 불러올까요?')) void load();
                }}>저장본 다시 불러오기</button>
                <Link href={`/project/${projectId}/report`} className="text-sm text-primary-300">결과보고서로</Link>
                {dirty && <span className="text-sm text-amber-300">저장하지 않은 변경사항이 있습니다.</span>}
            </div>
        </fieldset>
    </section>;
}
