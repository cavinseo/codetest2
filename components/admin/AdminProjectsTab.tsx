'use client';
// 관리자 화면의 프로젝트 관리 탭: 검색·프로그램별 보기, 이관, 멘토 배정, 삭제 요청.
//
// 관리자 화면(app/admin/page.tsx)이 이 탭의 검색어·프로그램 필터·배정 패널 열림 상태와 화면
// 120줄을 함께 들고 있었다(2026-10-25 코드 리뷰 L4). 목록과 삭제 확인은 화면이 들고, 이 탭은
// 보여 주기와 탭 안의 상태만 맡는다.
import { useState } from 'react';
import Link from 'next/link';
import MentorAssign from './MentorAssign';
import ProjectTransfer from './ProjectTransfer';
import type { MemberRole } from '@/lib/member-roles';

export interface AdminProject {
    id: string;
    name: string;
    description?: string;
    ownerId: string;
    programId: string;
    createdAt: string;
    updatedAt: string;
    ownerEmail: string | null;
    ownerName: string | null;
    reqCount: number;
    responseCount: number;
    memberCount: number;
}

interface Props {
    projects: AdminProject[];
    programs: { id: string; name: string; organization: string }[];
    role: MemberRole | null;
    canAssignMentor: boolean;
    onDelete: (project: AdminProject) => void;
    /** 이관이 끝나면 목록을 다시 불러온다. 실패하면 던진다(이관 창이 오류를 보여 준다). */
    onTransferred: () => Promise<void>;
}

export default function AdminProjectsTab({ projects, programs, role, canAssignMentor, onDelete, onTransferred }: Props) {
    const [searchProject, setSearchProject] = useState('');
    const [projectProgramId, setProjectProgramId] = useState('');
    const [openMentorAssign, setOpenMentorAssign] = useState<Record<string, boolean>>({});

    const toggleMentorAssign = (projectId: string) => {
        setOpenMentorAssign((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
    };

    const handleTransferred = async () => {
        // 대상 멘티의 다른 프로젝트도 멘토가 바뀔 수 있어 모든 배정 패널을 닫는다.
        setOpenMentorAssign({});
        await onTransferred();
    };

    const filteredProjects = projects.filter((p) => {
        if (projectProgramId && p.programId !== projectProgramId) return false;
        const q = searchProject.toLowerCase();
        return (
            p.name.toLowerCase().includes(q) ||
            (p.ownerEmail ?? '').toLowerCase().includes(q) ||
            (p.ownerName ?? '').toLowerCase().includes(q)
        );
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:flex-1 sm:max-w-sm">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input
                        type="text"
                        placeholder="프로젝트 이름 또는 소유자 검색..."
                        value={searchProject}
                        onChange={(e) => setSearchProject(e.target.value)}
                        className="input pl-10 w-full"
                        id="admin-project-search"
                    />
                </div>
                <select
                    id="admin-project-program-filter"
                    aria-label="프로그램별 프로젝트 보기"
                    className="input w-full sm:w-72"
                    value={projectProgramId}
                    onChange={(e) => setProjectProgramId(e.target.value)}
                >
                    <option value="">전체 프로그램</option>
                    {programs.map(program => (
                        <option key={program.id} value={program.id}>{program.name} ({program.organization})</option>
                    ))}
                </select>
                <span className="text-sm text-gray-500" aria-live="polite">{filteredProjects.length}개</span>
            </div>

            {filteredProjects.length === 0 ? (
                <div className="card text-center py-16">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                    </div>
                    <p className="text-gray-500 text-sm">{searchProject || projectProgramId ? '선택한 조건에 맞는 프로젝트가 없습니다.' : '등록된 프로젝트가 없습니다.'}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredProjects.map((project) => (
                        <div key={project.id} className="card hover:border-white/[0.1] transition-all duration-200">
                            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                                <div className="flex items-start gap-4 flex-1 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0">
                                        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-sm font-semibold text-white truncate">{project.name}</h3>
                                            <span className="text-[10px] font-mono text-gray-600 flex-shrink-0">{project.id}</span>
                                        </div>
                                        {project.description && (
                                            <p className="text-xs text-gray-500 mt-0.5 truncate">{project.description}</p>
                                        )}
                                        <div className="mt-1.5 flex items-center gap-1.5">
                                            <span className="inline-flex items-center gap-1 rounded-md border border-primary-500/20 bg-primary-500/10 px-2 py-0.5 text-[11px] text-primary-300">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                                소유자 {project.ownerName || '이름 없음'}
                                            </span>
                                            <span className="truncate text-[11px] text-gray-500">
                                                {project.ownerEmail || '계정 정보 없음'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                                            <span className="text-[11px] text-gray-600 flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                                요구사항 {project.reqCount}개
                                            </span>
                                            <span className="text-[11px] text-gray-600 flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                                                응답 {project.responseCount}개
                                            </span>
                                            <span className="text-[11px] text-gray-600 flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                                멤버 {project.memberCount}명
                                            </span>
                                            <span className="text-[11px] text-gray-600">
                                                {new Date(project.createdAt).toLocaleDateString('ko-KR')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                                    {role === 'ADMIN' && <ProjectTransfer projectId={project.id} onTransferred={handleTransferred} />}
                                    <Link
                                        href={`/project/${project.id}`}
                                        className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-gray-300 hover:bg-white/[0.08] transition-colors"
                                        id={`admin-view-project-${project.id}`}
                                    >
                                        보기
                                    </Link>
                                    <button
                                        onClick={() => onDelete(project)}
                                        className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors"
                                        id={`admin-delete-project-${project.id}`}
                                    >
                                        삭제
                                    </button>
                                </div>
                            </div>
                            {canAssignMentor && (
                                <>
                                    <div className="divider my-4" />
                                    <button
                                        type="button"
                                        onClick={() => toggleMentorAssign(project.id)}
                                        className="btn-secondary text-sm"
                                        id={`admin-mentor-assign-toggle-${project.id}`}
                                    >
                                        {openMentorAssign[project.id] ? '멘토 배정 닫기' : '멘토 배정'}
                                    </button>
                                    {openMentorAssign[project.id] && (
                                        <div className="mt-3">
                                            <MentorAssign projectId={project.id} />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
