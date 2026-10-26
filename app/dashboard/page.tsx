'use client';

import { useState, useEffect } from 'react';
import { groupProjectsByProgram } from '@/lib/project-grouping';
import Link from 'next/link';
import { canCreateProject, type MemberRole } from '@/lib/member-roles';
import ThemeToggle from '@/components/ThemeToggle';
import ProjectRequestsPanel from '@/components/ProjectRequestsPanel';
import NewProjectModal from '@/components/dashboard/NewProjectModal';
import { redirectToLoginOn401 } from '@/lib/client-fetch';

interface Project {
    id: string;
    name: string;
    description?: string;
    updatedAt: string;
    programId: string;
    programName: string;
    memberCount: number;
    surveyCount: number;
    qfdMatrixCount: number;
    role: 'OWNER' | 'EDITOR' | 'COACH' | 'ADMIN';
}

// 프로그램 선택 드롭다운의 "전체" 값. 실제 programId 와 겹치지 않는 빈 문자열을 쓴다.
const ALL_PROGRAMS = '';

export default function DashboardPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    // 관리자·프로그램 매니저·멘토처럼 여러 프로그램의 프로젝트를 보는 회원이 한 프로그램만
    // 골라 볼 수 있게 한다. 전환 버튼(전체/프로그램별 묶음)은 프로그램이 많아지면 한 화면에
    // 다 펼쳐져 찾기 어려워, "전체·프로그램1·프로그램2…" 드롭다운으로 바꿨다.
    const [selectedProgramId, setSelectedProgramId] = useState(ALL_PROGRAMS);
    const [role, setRole] = useState<MemberRole | null>(null);
    const [mentorProjectCreationEnabled, setMentorProjectCreationEnabled] = useState(false);
    const [userName, setUserName] = useState<string | null>(null);
    const [canAccessAdmin, setCanAccessAdmin] = useState<boolean | null>(null);
    // 목록 조회 결과. 실패를 빈 목록처럼
    // 보이면 "프로젝트가 없습니다 · 첫 프로젝트 만들기"가 떠서 이미 있는 프로젝트를 또 만들게
    // 했다(2026-10-25 코드 리뷰 B19). 불러오기 전에도 빈 화면 안내를 띄우지 않는다.
    const [projectsStatus, setProjectsStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
    const [showNewProjectModal, setShowNewProjectModal] = useState(false);
    const [approvalRequestId, setApprovalRequestId] = useState('');
    const [requestsVersion, setRequestsVersion] = useState(0);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    // 마운트 시 프로젝트 목록과 역할 로드
    useEffect(() => {
        fetchProjects();
        fetchRole();
    }, []);

    // 관리자/매니저 전용 링크를 가리기 위해 역할만 조회한다. 새 엔드포인트 대신
    // 이미 있는 본인 프로필 API(app/api/me/profile)를 쓴다.
    const fetchRole = async () => {
        try {
            const response = await fetch('/api/me/profile');
            if (response.ok) {
                const data = await response.json();
                setRole(data.role ?? null);
                setMentorProjectCreationEnabled(data.mentorProjectCreationEnabled === true);
                setUserName(data.name ?? null);
                setCanAccessAdmin(data.canAccessAdmin ?? false);
            }
        } catch (error) {
            console.error('역할 조회 실패:', error);
        }
    };

    const fetchProjects = async () => {
        try {
            setProjectsStatus('loading');
            const response = await fetch('/api/projects');
            // 로그인하지 않은 방문자에게 빈 대시보드와 "새 프로젝트" 버튼을 보여주면
            // 눌러도 401 로 조용히 실패한다. 곧장 로그인으로 보낸다.
            if (redirectToLoginOn401(response)) return;
            if (!response.ok) throw new Error(`프로젝트 목록 조회 실패 (${response.status})`);
            const data = await response.json();
            setProjects(data.projects || []);
            setProjectsStatus('loaded');
        } catch (error) {
            console.error('프로젝트 목록 조회 실패:', error);
            setProjectsStatus('failed');
        }
    };

    const handleProjectCreated = (project: Project) => {
        setProjects(prev => [...prev, project]);
        setShowNewProjectModal(false);
    };

    // 입력한 이름·설명은 창에 남는다. 승인 후 다시 열면 그대로 이어 쓴다.
    const handleApprovalRequested = () => {
        setRequestsVersion(v => v + 1);
        setShowNewProjectModal(false);
    };

    const handleLogout = async () => {
        setIsLoggingOut(true);
        try {
            const response = await fetch('/api/auth/logout', { method: 'POST' });
            if (!response.ok) throw new Error('로그아웃 실패');
            window.location.href = '/login';
        } catch (error) {
            console.error(error);
            alert('로그아웃에 실패했습니다.');
            setIsLoggingOut(false);
        }
    };

    const getRoleBadge = (role: string) => {
        const map: Record<string, { cls: string; label: string }> = {
            OWNER: { cls: 'badge-purple', label: '소유자' },
            EDITOR: { cls: 'badge-primary', label: '편집자' },
            COACH: { cls: 'badge-emerald', label: '코치' },
            ADMIN: { cls: 'badge-rose', label: '관리자' },
        };
        return map[role] || { cls: 'badge-primary', label: role };
    };

    const creationAllowed = role !== null && canCreateProject(role, mentorProjectCreationEnabled);

    const displayProjects = projects;
    const programGroups = groupProjectsByProgram(displayProjects);
    // 고른 프로그램이 목록에서 사라졌으면(다시 불러온 뒤 등) 전체로 되돌린다.
    const selectedProgram = programGroups.find((group) => group.programId === selectedProgramId) ?? null;
    const visibleProjects = selectedProgram ? selectedProgram.projects : displayProjects;

    const renderProjectCard = (project: Project, i: number) => (
        <Link
            key={project.id}
            href={`/project/${project.id}`}
            className="card-hover group"
            style={{ animationDelay: `${i * 0.1}s` }}
        >
            {/* Top Accent */}
            <div className="h-0.5 bg-gradient-to-r from-primary-500 to-accent-500 rounded-full mb-5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <h3 className="text-lg font-display font-semibold text-white group-hover:text-primary-400 transition-colors duration-200">
                        {project.name}
                    </h3>
                    <span className="inline-block mt-1 text-[11px] text-primary-400/80">
                        {project.programName}
                    </span>
                    {project.description && (
                        <p className="text-sm text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
                            {project.description}
                        </p>
                    )}
                </div>
                <svg className="w-5 h-5 text-gray-600 group-hover:text-primary-400 group-hover:translate-x-0.5 transition-all duration-200 ml-3 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>

            <div className="divider my-4" />

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {project.memberCount}명
                    </span>
                    <span className="flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        {new Date(project.updatedAt).toLocaleDateString('ko-KR')}
                    </span>
                </div>
                <span className={getRoleBadge(project.role).cls}>
                    {getRoleBadge(project.role).label}
                </span>
            </div>
        </Link>
    );

    // 상단 통계는 전부 이 회원에게 보이는 프로젝트에서만 뽑는다. Kano 설문과
    // QFD 매트릭스는 예전에 12·3 으로 박혀 있어, 프로젝트가 하나도 없는 회원에게도
    // 남의 숫자가 그대로 보였다.
    const teamMemberCount = displayProjects.reduce((acc, p) => acc + p.memberCount, 0);
    const surveyCount = displayProjects.reduce((acc, p) => acc + (p.surveyCount ?? 0), 0);
    const qfdMatrixCount = displayProjects.reduce((acc, p) => acc + (p.qfdMatrixCount ?? 0), 0);

    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative">
            {/* Subtle Orbs */}
            <div className="bg-orb w-[400px] h-[400px] bg-primary-600/50 top-[-200px] right-[10%] opacity-10" />
            <div className="bg-orb w-[300px] h-[300px] bg-accent-500/50 bottom-[-150px] left-[5%] opacity-10" />

            {/* Header */}
            <header className="relative z-10 glass border-b border-white/[0.06] rounded-none">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-y-3">
                        <Link href="/" className="flex items-center gap-3 rounded-xl transition-opacity hover:opacity-80" title="메인 화면으로 이동">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-sm font-bold">
                                K
                            </div>
                            <div>
                                <h1 className="text-lg font-display font-bold text-white leading-tight">
                                    KS-QFD
                                </h1>
                                <p className="text-xs text-gray-500">프로젝트 대시보드</p>
                            </div>
                        </Link>
                        <div className="flex items-center gap-3">
                            {/* /api/settings 도 /api/admin/* 도 requireAdmin 이다.
                                링크를 모두에게 열어 두면 비관리자가 서비스 설정에
                                들어가 SMTP 비밀번호·OAuth Secret 입력 폼을 보고
                                값을 넣게 된다. */}
                            {canAccessAdmin && (
                                <>
                                    <Link href="/settings" className="btn-ghost text-sm">
                                        🔗 서비스 설정
                                    </Link>
                                    <Link href="/admin" className="btn-ghost text-sm">
                                        🛡️ 관리자모드
                                    </Link>
                                </>
                            )}
                            {role === 'PROGRAM_MANAGER' && (
                                <Link href="/manage" className="btn-ghost text-sm">
                                    🧭 프로그램 관리
                                </Link>
                            )}
                            <ThemeToggle />
                            <div className="w-px h-6 bg-white/10" />
                            <Link
                                href="/profile"
                                className="flex items-center gap-2 rounded-xl px-2 py-1 -mx-2 transition-colors hover:bg-white/[0.06]"
                                title="사용자 정보 보기·수정"
                                id="dashboard-profile-link"
                            >
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center text-xs text-white font-bold">
                                    {(userName ?? '사용자').charAt(0)}
                                </div>
                                <span className="text-sm text-gray-300 hidden sm:block">{userName ?? '사용자'}</span>
                            </Link>
                            <button
                                onClick={handleLogout}
                                disabled={isLoggingOut}
                                className="btn-ghost text-sm text-gray-300 disabled:opacity-50"
                            >
                                {isLoggingOut ? '로그아웃 중...' : '🚪 로그아웃'}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 page-enter">
                {/* Stats */}
                {role === 'MENTEE' && <div className="mb-8"><ProjectRequestsPanel key={`${projects.length}-${requestsVersion}`} onCreate={id => {
                    setApprovalRequestId(id);
                    setShowNewProjectModal(true);
                }} /></div>}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                    {[
                        { label: '전체 프로젝트', value: displayProjects.length, icon: '📁', accent: 'from-blue-500/20 to-cyan-500/20' },
                        { label: '팀 멤버', value: teamMemberCount, icon: '👥', accent: 'from-purple-500/20 to-pink-500/20' },
                        { label: 'Kano 설문', value: surveyCount, icon: '📊', accent: 'from-emerald-500/20 to-teal-500/20' },
                        { label: 'QFD 매트릭스', value: qfdMatrixCount, icon: '🔗', accent: 'from-amber-500/20 to-orange-500/20' },
                    ].map((stat) => (
                        <div key={stat.label} className="stat-card">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.accent} flex items-center justify-center text-xl mx-auto mb-3`}>
                                {stat.icon}
                            </div>
                            <div className="text-2xl font-display font-bold text-white">{stat.value}</div>
                            <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
                        </div>
                    ))}
                </div>

                {/* Action Bar */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-display font-bold text-white">내 프로젝트</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            {displayProjects.length}개의 활성 프로젝트
                            {programGroups.length > 1 && ` · ${programGroups.length}개 프로그램`}
                        </p>
                        {/* 프로그램이 하나뿐이면 골라도 같은 목록이라 드롭다운을 감춘다. */}
                        {programGroups.length > 1 && <label className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                            프로그램
                            <select
                                className="input w-auto py-1 text-sm"
                                value={selectedProgram ? selectedProgram.programId : ALL_PROGRAMS}
                                onChange={(event) => setSelectedProgramId(event.target.value)}
                                id="dashboard-program-filter"
                            >
                                <option value={ALL_PROGRAMS}>전체 ({displayProjects.length}개)</option>
                                {programGroups.map((group) => (
                                    <option key={group.programId} value={group.programId}>
                                        {group.programName} ({group.projects.length}개)
                                    </option>
                                ))}
                            </select>
                        </label>}
                    </div>
                    {role === 'MENTOR' && !creationAllowed && (
                        <button disabled className="btn-secondary opacity-60" title="관리자가 멘토별로 프로젝트 생성을 활성화할 수 있습니다.">새 프로젝트 (사용중지)</button>
                    )}
                    {creationAllowed && (
                        <button
                            onClick={() => { setApprovalRequestId(''); setShowNewProjectModal(true); }}
                            className="btn-primary flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            <span>새 프로젝트</span>
                        </button>
                    )}
                </div>

                {/* Project Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {visibleProjects.map(renderProjectCard)}

                    {projectsStatus === 'failed' && (
                        <div className="col-span-full text-center py-16" role="alert">
                            <h3 className="text-xl font-display font-semibold text-gray-300 mb-2">
                                프로젝트 목록을 불러오지 못했습니다
                            </h3>
                            <p className="text-gray-500 mb-6 text-sm">이미 만든 프로젝트가 있을 수 있습니다. 다시 불러온 뒤 확인하세요.</p>
                            <button type="button" onClick={() => void fetchProjects()} className="btn-primary">
                                다시 불러오기
                            </button>
                        </div>
                    )}

                    {/* Empty State */}
                    {projectsStatus === 'loaded' && displayProjects.length === 0 && (
                        <div className="col-span-full text-center py-16">
                            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-4xl">
                                📊
                            </div>
                            <h3 className="text-xl font-display font-semibold text-gray-300 mb-2">
                                프로젝트가 없습니다
                            </h3>
                            <p className="text-gray-500 mb-6 text-sm">
                                {creationAllowed
                                    ? '새 프로젝트를 만들어 품질 개선을 시작하세요'
                                    : '프로젝트에 참가자로 추가되면 이곳에 표시됩니다'}
                            </p>
                            {creationAllowed && (
                                <button
                                    onClick={() => { setApprovalRequestId(''); setShowNewProjectModal(true); }}
                                    className="btn-primary"
                                >
                                    첫 프로젝트 만들기
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </main>

            <NewProjectModal<Project>
                open={showNewProjectModal}
                role={role}
                creationAllowed={creationAllowed}
                ownsProject={projects.some(p => p.role === 'OWNER')}
                approvalRequestId={approvalRequestId}
                onApprovalRequestIdChange={setApprovalRequestId}
                onClose={() => setShowNewProjectModal(false)}
                onCreated={handleProjectCreated}
                onApprovalRequested={handleApprovalRequested}
            />
        </div>
    );
}
