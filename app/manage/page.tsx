'use client';
// 프로그램 매니저 화면. 초대 코드 발행과 멘토 배정만 다룬다.
//
// /admin 은 회원 삭제·역할 변경이 있어 관리자 전용이다. 매니저에게 그 화면을
// 열어 주고 탭만 숨기면 권한 경계가 화면 조건문에 기대게 된다. 그래서 나눈다.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import InvitesTab from '@/components/admin/InvitesTab';
import ProgramsTab from '@/components/admin/ProgramsTab';
import MentorAssign from '@/components/admin/MentorAssign';

interface ProjectRow {
    id: string;
    name: string;
}

type Tab = 'programs' | 'invites' | 'assign';

export default function ManagePage() {
    const [tab, setTab] = useState<Tab>('programs');
    const [projects, setProjects] = useState<ProjectRow[]>([]);
    const [selectedProject, setSelectedProject] = useState('');
    const [denied, setDenied] = useState(false);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            // 미로그인은 로그인창으로, 로그인은 했지만 초대·배정 권한이 없으면 안내 화면으로 보낸다.
            const res = await fetch('/api/invites');
            if (res.status === 401) {
                window.location.replace('/login');
                return;
            }
            if (res.status === 403) {
                setDenied(true);
                return;
            }

            const projectRes = await fetch('/api/projects');
            if (projectRes.ok) setProjects((await projectRes.json()).projects);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (denied) {
        return (
            <div className="min-h-screen bg-surface-900 bg-grid relative flex items-center justify-center px-4">
                <div className="bg-orb w-[500px] h-[500px] bg-rose-500/40 top-[-150px] right-[-100px] opacity-10" />
                <div className="glass-strong relative z-10 w-full max-w-md p-8 text-center animate-fade-in">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-3xl">
                        🔒
                    </div>
                    <h1 className="mb-2 text-2xl font-display font-bold text-white">권한이 없습니다</h1>
                    <p className="mb-8 text-sm leading-relaxed text-gray-400">
                        이 화면은 관리자와 프로그램 매니저만 볼 수 있습니다.
                    </p>
                    <Link href="/dashboard" className="btn-secondary py-3 text-sm">
                        대시보드로 돌아가기
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative">
            <div className="bg-orb w-[500px] h-[500px] bg-primary-600/40 top-[-200px] left-[5%] opacity-10" />

            {/* Header */}
            <header className="relative z-10 glass border-b border-white/[0.06] rounded-none sticky top-0">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="btn-ghost text-sm flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            대시보드
                        </Link>
                        <div className="w-px h-6 bg-white/10" />
                        <div>
                            <h1 className="text-xl font-display font-bold text-white flex items-center gap-2">
                                <span className="w-6 h-6 rounded-md bg-gradient-to-br from-primary-500/30 to-accent-500/30 flex items-center justify-center text-xs">🧭</span>
                                프로그램 관리
                            </h1>
                            <p className="text-xs text-gray-500 mt-0.5">프로그램 개설, 초대 코드 발행, 멘토 배정</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 page-enter">
                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/[0.06] rounded-2xl mb-8 w-fit">
                    <button
                        type="button"
                        onClick={() => setTab('programs')}
                        id="manage-tab-programs"
                        className={tab === 'programs' ? 'nav-tab-active' : 'nav-tab'}
                    >
                        프로그램
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('invites')}
                        id="manage-tab-invites"
                        className={tab === 'invites' ? 'nav-tab-active' : 'nav-tab'}
                    >
                        초대
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('assign')}
                        id="manage-tab-assign"
                        className={tab === 'assign' ? 'nav-tab-active' : 'nav-tab'}
                    >
                        멘토 배정
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <div className="flex flex-col items-center gap-4">
                            <svg className="animate-spin h-8 w-8 text-primary-400" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <p className="text-gray-500 text-sm">데이터를 불러오는 중...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {tab === 'programs' && <ProgramsTab />}

                        {tab === 'invites' && <InvitesTab />}

                        {tab === 'assign' && (
                            <div className="space-y-4">
                                <select
                                    className="input w-auto"
                                    value={selectedProject}
                                    onChange={(e) => setSelectedProject(e.target.value)}
                                    id="manage-project-select"
                                >
                                    <option value="">프로젝트 선택</option>
                                    {projects.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                {selectedProject ? (
                                    <MentorAssign projectId={selectedProject} />
                                ) : (
                                    <p className="text-sm text-gray-500">배정할 프로젝트를 먼저 선택하세요.</p>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
