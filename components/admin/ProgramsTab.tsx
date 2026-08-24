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

const EMPTY_FORM = { name: '', organization: '', startsAt: '', endsAt: '' };

export default function ProgramsTab() {
    const [programs, setPrograms] = useState<ProgramRow[]>([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [showCreate, setShowCreate] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    const load = useCallback(async () => {
        const res = await fetch('/api/programs');
        if (!res.ok) {
            setMessage({ type: 'error', text: '프로그램 목록을 불러오지 못했습니다.' });
            return;
        }
        const data = await res.json();
        setPrograms(data.programs);
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
                    {programs.map((p) => (
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
                            <div className="flex items-center gap-4 text-[11px] text-gray-500">
                                <span>멘티 {p.menteeCount}명</span>
                                <span>프로젝트 {p.projectCount}개</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
