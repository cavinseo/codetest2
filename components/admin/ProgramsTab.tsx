'use client';
// 프로그램(기관 단위로 개설하는 주제별 단위) 개설·목록 화면. 관리자와
// 프로그램 매니저가 함께 쓴다. 매니저는 자신이 개설한 프로그램만 본다.

import { useCallback, useEffect, useState } from 'react';

interface ProgramRow {
    id: string;
    name: string;
    organization: string;
    startsAt: string;
    endsAt: string;
    managerName: string;
    managerEmail: string;
    projectCount: number;
    menteeCount: number;
}

interface ProjectOption {
    id: string;
    name: string;
    programId: string;
    programName: string;
}

const EMPTY_FORM = { name: '', organization: '', startsAt: '', endsAt: '' };

export default function ProgramsTab() {
    const [programs, setPrograms] = useState<ProgramRow[]>([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [showCreate, setShowCreate] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    // 프로젝트 불러오기: 프로그램마다 패널을 따로 열고 닫으므로 programId 로 키를 잡는다.
    const [openImport, setOpenImport] = useState<Record<string, boolean>>({});
    // null = 아직 안 받아왔다. 여러 프로그램이 같은 전체 목록을 공유해서 한 번만 받는다.
    const [allProjects, setAllProjects] = useState<ProjectOption[] | null>(null);
    const [importSelection, setImportSelection] = useState<Record<string, string>>({});
    const [importBusy, setImportBusy] = useState<Record<string, boolean>>({});

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/programs');
            const data = await res.json().catch(() => null);
            if (!res.ok || !data) {
                setMessage({ type: 'error', text: data?.error || '프로그램 목록을 불러오지 못했습니다.' });
                return;
            }
            setPrograms(data.programs);
        } catch {
            setMessage({ type: 'error', text: '프로그램 목록을 불러오지 못했습니다. 연결을 확인하세요.' });
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const create = async () => {
        setIsBusy(true);
        setMessage(null);
        try {
            const res = await fetch('/api/programs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || '개설에 실패했습니다.');

            setMessage({ type: 'success', text: `"${data.program.name}" 프로그램을 개설했습니다.` });
            setForm(EMPTY_FORM);
            setShowCreate(false);
            await load();
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : '개설에 실패했습니다.' });
        } finally {
            setIsBusy(false);
        }
    };

    const canSubmit = form.name && form.organization && form.startsAt && form.endsAt;

    // 후보 목록을 받아 온다. 실패해도 반드시 null 을 벗어나야 한다 — null 로
    // 남으면 화면이 "불러오는 중..." 에 영원히 갇힌다.
    const loadCandidates = useCallback(async () => {
        try {
            const res = await fetch('/api/projects');
            const data = await res.json().catch(() => null);
            if (!res.ok || !data) {
                setMessage({ type: 'error', text: data?.error || '프로젝트 목록을 불러오지 못했습니다.' });
                setAllProjects([]);
                return;
            }
            setAllProjects(data.projects);
        } catch {
            setMessage({ type: 'error', text: '프로젝트 목록을 불러오지 못했습니다. 연결을 확인하세요.' });
            setAllProjects([]);
        }
    }, []);

    // 목록은 패널을 처음 열 때만 받는다 — 아무도 안 쓰면 그 API 를 부르지 않는다.
    const toggleImport = (programId: string) => {
        setOpenImport((prev) => ({ ...prev, [programId]: !prev[programId] }));
        if (allProjects === null) loadCandidates();
    };

    const importProject = async (programId: string) => {
        const projectId = importSelection[programId];
        if (!projectId) return;

        setImportBusy((prev) => ({ ...prev, [programId]: true }));
        setMessage(null);
        try {
            const attempt = (confirmReassign: boolean) => fetch(`/api/programs/${programId}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, ...(confirmReassign ? { confirmReassign: true } : {}) }),
            });

            let res = await attempt(false);
            let data = await res.json().catch(() => null);

            // 이미 다른 프로그램 소속이면 서버가 409 로 멈춘다. 여기서 한 번 더 물어보고,
            // 승낙하면 confirmReassign 을 실어 같은 요청을 다시 보낸다.
            if (res.status === 409 && data?.needsReassignConfirm) {
                if (!window.confirm(data.error)) return;
                res = await attempt(true);
                data = await res.json().catch(() => null);
            }

            if (!res.ok) throw new Error(data?.error || '프로젝트를 불러오지 못했습니다.');

            setMessage({ type: 'success', text: `"${data.project.name}" 프로젝트를 불러왔습니다.` });
            setImportSelection((prev) => ({ ...prev, [programId]: '' }));
            // 방금 옮긴 프로젝트의 programId 가 바뀌었으니 후보 목록을 실제로 다시
            // 받아 온다. 여기서 null 로만 되돌리면 다시 받는 쪽(toggleImport)은
            // 패널을 여는 순간에만 도는데 패널은 이미 열려 있어, 화면이
            // "불러오는 중..." 에 그대로 갇힌다.
            await Promise.all([loadCandidates(), load()]);
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : '프로젝트를 불러오지 못했습니다.' });
        } finally {
            setImportBusy((prev) => ({ ...prev, [programId]: false }));
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">프로그램 ({programs.length})</h3>
                <button type="button" onClick={() => setShowCreate((v) => !v)}
                    className="btn-secondary text-sm" id="programs-create-toggle">
                    {showCreate ? '닫기' : '프로그램 개설'}
                </button>
            </div>

            {showCreate && (
                <div className="card space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-medium text-gray-400">
                            프로그램명
                            <input className="input mt-2" value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="예: 2026 하반기 스타트업 육성" id="programs-name" />
                        </label>
                        <label className="block text-sm font-medium text-gray-400">
                            주관기관명
                            <input className="input mt-2" value={form.organization}
                                onChange={(e) => setForm({ ...form, organization: e.target.value })}
                                placeholder="예: 가나기술원" id="programs-organization" />
                        </label>
                        <label className="block text-sm font-medium text-gray-400">
                            시작일
                            <input type="date" className="input mt-2" value={form.startsAt}
                                onChange={(e) => setForm({ ...form, startsAt: e.target.value })} id="programs-starts-at" />
                        </label>
                        <label className="block text-sm font-medium text-gray-400">
                            종료일
                            <input type="date" className="input mt-2" value={form.endsAt}
                                onChange={(e) => setForm({ ...form, endsAt: e.target.value })} id="programs-ends-at" />
                        </label>
                    </div>
                    <div className="flex justify-end">
                        <button type="button" onClick={create} disabled={isBusy || !canSubmit}
                            className="btn-primary text-sm disabled:opacity-50" id="programs-create-submit">
                            {isBusy ? '만드는 중...' : '개설하기'}
                        </button>
                    </div>
                </div>
            )}

            {message && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${message.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                    }`}>
                    {message.text}
                </div>
            )}

            {programs.length === 0 ? (
                <div className="card text-center py-16">
                    <p className="text-gray-500 text-sm">개설된 프로그램이 없습니다.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {programs.map((p) => {
                        // 이미 이 프로그램 소속인 것을 골라 봐야 서버가 400 을 줄 뿐이라 미리 뺀다.
                        const candidates = (allProjects ?? []).filter((proj) => proj.programId !== p.id);
                        return (
                            <div key={p.id} className="card">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h4 className="text-sm font-semibold text-white">{p.name}</h4>
                                        <p className="text-xs text-gray-500 mt-0.5">{p.organization}</p>
                                        <p className="text-[11px] text-gray-600 mt-1">
                                            {p.startsAt.slice(0, 10)} ~ {p.endsAt.slice(0, 10)}
                                        </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-xs text-gray-400">{p.managerName}</p>
                                        <p className="text-[11px] text-gray-600">{p.managerEmail}</p>
                                    </div>
                                </div>
                                <div className="divider my-3" />
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 text-[11px] text-gray-500">
                                        <span>멘티 {p.menteeCount}명</span>
                                        <span>프로젝트 {p.projectCount}개</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => toggleImport(p.id)}
                                        className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-gray-300 hover:bg-white/[0.08] transition-colors"
                                        id={`programs-import-toggle-${p.id}`}
                                    >
                                        {openImport[p.id] ? '닫기' : '프로젝트 불러오기'}
                                    </button>
                                </div>

                                {openImport[p.id] && (
                                    <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap items-end gap-3">
                                        {allProjects === null ? (
                                            <p className="text-xs text-gray-500">불러오는 중...</p>
                                        ) : candidates.length === 0 ? (
                                            <p className="text-xs text-gray-500">불러올 수 있는 다른 프로젝트가 없습니다.</p>
                                        ) : (
                                            <>
                                                <label className="block text-sm font-medium text-gray-400 flex-1 min-w-[220px]">
                                                    프로젝트
                                                    <select
                                                        className="input mt-2"
                                                        value={importSelection[p.id] ?? ''}
                                                        onChange={(e) => setImportSelection((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                                        id={`programs-import-select-${p.id}`}
                                                    >
                                                        <option value="">선택하세요</option>
                                                        {candidates.map((proj) => (
                                                            <option key={proj.id} value={proj.id}>
                                                                {proj.name} (현재: {proj.programName})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => importProject(p.id)}
                                                    disabled={importBusy[p.id] || !importSelection[p.id]}
                                                    className="btn-primary text-sm disabled:opacity-50"
                                                    id={`programs-import-submit-${p.id}`}
                                                >
                                                    {importBusy[p.id] ? '불러오는 중...' : '불러오기'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
