'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    getBusinessPlanFileValidationError,
    readAndSerializeBusinessPlanFile,
} from '@/lib/business-plan-file';
import {
    PROJECT_AI_MODES,
    PROJECT_AI_MODE_DESCRIPTIONS,
    PROJECT_AI_MODE_LABELS,
    type ProjectAiMode,
} from '@/lib/ai/project-ai-mode';
import { canCreateProject, type MemberRole } from '@/lib/member-roles';

interface Project {
    id: string;
    name: string;
    description?: string;
    updatedAt: string;
    programName: string;
    memberCount: number;
    role: 'OWNER' | 'EDITOR' | 'COACH' | 'ADMIN';
}

interface ProgramOption {
    id: string;
    name: string;
    organization: string;
}

interface MenteeOption {
    id: string;
    name: string;
    email: string;
}

export default function DashboardPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [role, setRole] = useState<MemberRole | null>(null);
    const [userName, setUserName] = useState<string | null>(null);
    const [canAccessAdmin, setCanAccessAdmin] = useState<boolean | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showNewProjectModal, setShowNewProjectModal] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [newProjectDetailDesc, setNewProjectDetailDesc] = useState('');
    const [newProjectFile, setNewProjectFile] = useState<File | null>(null);
    // 폴백 체인이 받쳐주므로 기본값은 로컬 AI 연결로 둔다.
    const [newProjectAiMode, setNewProjectAiMode] = useState<ProjectAiMode>('local');
    const [newProjectError, setNewProjectError] = useState('');
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    // 프로그램은 매니저·관리자가 열고, 그 안의 프로젝트는 참여 멘티가 소유한다.
    // 그래서 새 프로젝트를 만들 때 어느 프로그램의, 어느 멘티 것인지 함께 고른다.
    const [programs, setPrograms] = useState<ProgramOption[]>([]);
    const [mentees, setMentees] = useState<MenteeOption[]>([]);
    const [newProjectProgramId, setNewProjectProgramId] = useState('');
    const [newProjectOwnerMenteeId, setNewProjectOwnerMenteeId] = useState('');

    // 마운트 시 프로젝트 목록과 역할 로드
    useEffect(() => {
        fetchProjects();
        fetchRole();
    }, []);

    // 프로젝트를 만들 수 있는 역할만 프로그램 목록이 필요하다. 멘티·멘토에게는
    // 이 API 가 403 이므로 애초에 부르지 않는다.
    useEffect(() => {
        if (!role || !canCreateProject(role)) return;
        fetch('/api/programs')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!data) return;
                setPrograms(data.programs);
                setNewProjectProgramId((prev) => prev || data.programs[0]?.id || '');
            })
            .catch(() => { /* 프로그램 목록 없이도 나머지 화면은 그대로 쓸 수 있다 */ });
    }, [role]);

    // 고른 프로그램이 바뀌면 그 프로그램 소속 멘티로 후보를 다시 채운다.
    // 이전 프로그램의 멘티가 새 프로그램의 소유자로 잘못 남지 않도록 선택을 지운다.
    useEffect(() => {
        if (!newProjectProgramId) { setMentees([]); return; }
        setNewProjectOwnerMenteeId('');
        fetch(`/api/programs/${newProjectProgramId}/mentees`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => setMentees(data?.mentees ?? []))
            .catch(() => setMentees([]));
    }, [newProjectProgramId]);

    // 관리자/매니저 전용 링크를 가리기 위해 역할만 조회한다. 새 엔드포인트 대신
    // 이미 있는 본인 프로필 API(app/api/me/profile)를 쓴다.
    const fetchRole = async () => {
        try {
            const response = await fetch('/api/me/profile');
            if (response.ok) {
                const data = await response.json();
                setRole(data.role ?? null);
                setUserName(data.name ?? null);
                setCanAccessAdmin(data.canAccessAdmin ?? false);
            }
        } catch (error) {
            console.error('역할 조회 실패:', error);
        }
    };

    const fetchProjects = async () => {
        try {
            setIsLoading(true);
            const response = await fetch('/api/projects');
            // 로그인하지 않은 방문자에게 빈 대시보드와 "새 프로젝트" 버튼을 보여주면
            // 눌러도 401 로 조용히 실패한다. 곧장 로그인으로 보낸다.
            if (response.status === 401) {
                window.location.replace('/login');
                return;
            }
            if (response.ok) {
                const data = await response.json();
                setProjects(data.projects || []);
            }
        } catch (error) {
            console.error('프로젝트 목록 조회 실패:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        setNewProjectError('');
        setIsLoading(true);
        try {
            let businessPlanFile: string | undefined;
            if (newProjectFile) {
                businessPlanFile = await readAndSerializeBusinessPlanFile(newProjectFile);
            }

            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newProjectName,
                    description: newProjectDesc,
                    detailedDescription: newProjectDetailDesc || undefined,
                    businessPlanFile,
                    aiMode: newProjectAiMode,
                    programId: newProjectProgramId,
                    ownerMenteeId: newProjectOwnerMenteeId,
                }),
            });
            // 작성 중 세션이 만료된 경우에도 오류 문구 대신 로그인으로 보낸다.
            if (response.status === 401) {
                window.location.replace('/login');
                return;
            }
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.error || '프로젝트 생성에 실패했습니다.');
            setProjects([...projects, data.project]);
            setShowNewProjectModal(false);
            setNewProjectName('');
            setNewProjectDesc('');
            setNewProjectDetailDesc('');
            setNewProjectFile(null);
            setNewProjectAiMode('local');
            setNewProjectOwnerMenteeId('');
        } catch (error) {
            console.error(error);
            setNewProjectError(error instanceof Error ? error.message : '프로젝트 생성에 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
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

    const displayProjects = projects;

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
                        {/* 오른쪽 상단에 고정된 ThemeToggle 이 이 영역을 덮으므로 그만큼 여백을 확보한다 */}
                        <div className="flex items-center gap-3 sm:mr-44">
                            <Link href="/settings" className="btn-ghost text-sm">
                                🔗 서비스 설정
                            </Link>
                            {canAccessAdmin && (
                                <Link href="/admin" className="btn-ghost text-sm">
                                    🛡️ 관리자모드
                                </Link>
                            )}
                            {role === 'PROGRAM_MANAGER' && (
                                <Link href="/manage" className="btn-ghost text-sm">
                                    🧭 프로그램 관리
                                </Link>
                            )}
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                    {[
                        { label: '전체 프로젝트', value: displayProjects.length, icon: '📁', accent: 'from-blue-500/20 to-cyan-500/20' },
                        { label: '팀 멤버', value: displayProjects.reduce((acc, p) => acc + p.memberCount, 0), icon: '👥', accent: 'from-purple-500/20 to-pink-500/20' },
                        { label: 'Kano 설문', value: 12, icon: '📊', accent: 'from-emerald-500/20 to-teal-500/20' },
                        { label: 'QFD 매트릭스', value: 3, icon: '🔗', accent: 'from-amber-500/20 to-orange-500/20' },
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
                        </p>
                    </div>
                    {/* 프로젝트 생성 권한이 없는 역할(멘토·멘티)에게는 버튼을 감춘다. API 가 403 으로 막기 때문이다. */}
                    {role !== null && canCreateProject(role) && (
                        <button
                            onClick={() => setShowNewProjectModal(true)}
                            className="btn-primary flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            <span>새 프로젝트</span>
                        </button>
                    )}
                </div>

                {/* Project Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {displayProjects.map((project, i) => (
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
                    ))}

                    {/* Empty State */}
                    {displayProjects.length === 0 && (
                        <div className="col-span-full text-center py-16">
                            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-4xl">
                                📊
                            </div>
                            <h3 className="text-xl font-display font-semibold text-gray-300 mb-2">
                                프로젝트가 없습니다
                            </h3>
                            <p className="text-gray-500 mb-6 text-sm">
                                {role !== null && canCreateProject(role)
                                    ? '새 프로젝트를 만들어 품질 개선을 시작하세요'
                                    : '프로젝트에 참가자로 추가되면 이곳에 표시됩니다'}
                            </p>
                            {role !== null && canCreateProject(role) && (
                                <button
                                    onClick={() => setShowNewProjectModal(true)}
                                    className="btn-primary"
                                >
                                    첫 프로젝트 만들기
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* New Project Modal */}
            {showNewProjectModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowNewProjectModal(false)}>
                    <div className="modal-content max-w-lg">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-display font-bold text-white">새 프로젝트</h3>
                            <button
                                onClick={() => setShowNewProjectModal(false)}
                                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleCreateProject} className="space-y-5">
                            {newProjectError && (
                                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                    {newProjectError}
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    프로젝트 이름 <span className="text-primary-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    className="input"
                                    placeholder="예: 스마트 IoT 센서 개발"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        프로그램 <span className="text-primary-400">*</span>
                                    </label>
                                    <select
                                        required
                                        value={newProjectProgramId}
                                        onChange={(e) => setNewProjectProgramId(e.target.value)}
                                        className="input"
                                    >
                                        <option value="" disabled>선택하세요</option>
                                        {programs.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        소유할 멘티 <span className="text-primary-400">*</span>
                                    </label>
                                    <select
                                        required
                                        value={newProjectOwnerMenteeId}
                                        onChange={(e) => setNewProjectOwnerMenteeId(e.target.value)}
                                        className="input"
                                        disabled={!newProjectProgramId}
                                    >
                                        <option value="" disabled>선택하세요</option>
                                        {mentees.map((m) => (
                                            <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {newProjectProgramId && mentees.length === 0 && (
                                <p className="text-xs text-amber-400 -mt-3">
                                    이 프로그램에 속한 멘티가 아직 없습니다. 먼저 멘티를 초대하세요.
                                </p>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    설명 <span className="text-gray-600">(선택)</span>
                                </label>
                                <textarea
                                    value={newProjectDesc}
                                    onChange={(e) => setNewProjectDesc(e.target.value)}
                                    rows={2}
                                    className="input resize-none"
                                    placeholder="프로젝트에 대한 간단한 설명"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    상세 설명 <span className="text-gray-600">(선택)</span>
                                </label>
                                <textarea
                                    value={newProjectDetailDesc}
                                    onChange={(e) => setNewProjectDetailDesc(e.target.value)}
                                    rows={4}
                                    className="input resize-none"
                                    placeholder="제품/서비스의 목적, 대상 사용자, 주요 기능 등 상세 정보 (자동 스펙 생성 시 활용됨)"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    사업계획서 <span className="text-gray-600">(선택)</span>
                                </label>
                                <div className={`relative border-2 border-dashed rounded-xl p-4 transition-all duration-200 ${newProjectFile
                                    ? 'border-primary-500/30 bg-primary-500/5'
                                    : 'border-white/[0.08] hover:border-white/[0.15] bg-white/[0.02]'
                                    }`}>
                                    {newProjectFile ? (
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary-500/15 flex items-center justify-center flex-shrink-0">
                                                <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-white truncate">{newProjectFile.name}</p>
                                                <p className="text-xs text-gray-500">{(newProjectFile.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setNewProjectFile(null)}
                                                className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-rose-400 transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="flex flex-col items-center cursor-pointer">
                                            <svg className="w-8 h-8 text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                            <span className="text-xs text-gray-400">클릭하여 파일 선택</span>
                                            <span className="text-[10px] text-gray-600 mt-1">PDF, DOC, DOCX, TXT (최대 10MB)</span>
                                            <input
                                                type="file"
                                                accept=".pdf,.docx,.doc,.txt"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    const validationError = getBusinessPlanFileValidationError(file);
                                                    if (validationError) {
                                                        setNewProjectError(validationError);
                                                        e.target.value = '';
                                                        return;
                                                    }
                                                    setNewProjectError('');
                                                    setNewProjectFile(file);
                                                }}
                                            />
                                        </label>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    AI 에이전트 연결 방식
                                </label>
                                <div className="space-y-2">
                                    {PROJECT_AI_MODES.map((mode) => (
                                        <label
                                            key={mode}
                                            className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${newProjectAiMode === mode
                                                ? 'border-primary-500/30 bg-primary-500/5'
                                                : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]'
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name="new-project-ai-mode"
                                                value={mode}
                                                checked={newProjectAiMode === mode}
                                                onChange={() => setNewProjectAiMode(mode)}
                                                className="mt-1 flex-shrink-0"
                                            />
                                            <span className="min-w-0">
                                                <span className="block text-sm text-white">{PROJECT_AI_MODE_LABELS[mode]}</span>
                                                <span className="mt-0.5 block text-xs text-gray-500">
                                                    {PROJECT_AI_MODE_DESCRIPTIONS[mode]}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                <p className="mt-2 text-[11px] text-gray-600">
                                    나중에 프로젝트 설정에서 바꿀 수 있습니다.
                                </p>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowNewProjectModal(false);
                                        setNewProjectName('');
                                        setNewProjectDesc('');
                                        setNewProjectDetailDesc('');
                                        setNewProjectFile(null);
                                        setNewProjectError('');
                                    }}
                                    className="flex-1 btn-secondary py-3"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="flex-1 btn-primary py-3 disabled:opacity-50"
                                >
                                    {isLoading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                            생성 중...
                                        </span>
                                    ) : '프로젝트 생성'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
