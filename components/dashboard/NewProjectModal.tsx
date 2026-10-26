'use client';
// 대시보드의 "새 프로젝트" 창. 역할에 따라 고르는 것이 다르다.
//   관리자·프로그램 매니저: 프로그램과 소유할 멘티를 고른다.
//   멘토: 배정 멘티를 고르고, 그 멘티의 두 번째 프로젝트부터는 매니저 승인을 고른다.
//   멘티: 본인 것만 만들며, 이미 소유한 프로젝트가 있으면 승인을 먼저 신청한다.
//
// 대시보드(app/dashboard/page.tsx)가 이 창의 상태 14개·effect 3개·생성 처리를 함께 들고 있어
// 700줄을 넘었다(2026-10-25 코드 리뷰 L8). 창은 닫혀도 사라지지 않는다 — 승인을 신청하러 닫았다
// 다시 열면 적던 이름·설명이 그대로 남아야 하기 때문이다(예전과 같다).
import { useEffect, useState } from 'react';
import {
    getBusinessPlanFileValidationError,
    readAndSerializeBusinessPlanFile,
} from '@/lib/business-plan-file';
import { canCreateProjectForOthers, type MemberRole } from '@/lib/member-roles';
import { ProjectApprovalRequestBox } from '@/components/ProjectRequestsPanel';
import { readJsonOrThrow, redirectToLoginOn401 } from '@/lib/client-fetch';

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

interface MentorMenteeOption extends MenteeOption {
    program: { id: string; name: string };
    ownedProjectCount: number;
    approvals: { id: string; reason: string }[];
}

export interface NewProjectModalProps<P> {
    open: boolean;
    role: MemberRole | null;
    creationAllowed: boolean;
    /** 이 회원이 이미 소유한 프로젝트가 있는가(멘티의 추가 개설 승인 판단). */
    ownsProject: boolean;
    /** 이번 개설에 쓸 승인. 멘티의 "승인으로 개설" 버튼이 미리 정해 연다. */
    approvalRequestId: string;
    /**
     * 상태 setter 처럼 바뀌지 않는 함수를 넘긴다. 멘토용 배정 멘티 조회 effect 가 이 함수에 기대므로,
     * 렌더마다 새 함수를 넘기면 창이 열려 있는 동안 조회를 되풀이한다.
     */
    onApprovalRequestIdChange: (id: string) => void;
    onClose: () => void;
    onCreated: (project: P) => void;
    /** 멘티가 이 창에서 추가 개설 승인을 신청했다. */
    onApprovalRequested: () => void;
}

export default function NewProjectModal<P>({
    open, role, creationAllowed, ownsProject, approvalRequestId, onApprovalRequestIdChange, onClose, onCreated, onApprovalRequested,
}: NewProjectModalProps<P>) {
    const [mentorMentees, setMentorMentees] = useState<MentorMenteeOption[]>([]);
    const [loadingCreationOptions, setLoadingCreationOptions] = useState(false);
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    // 서버가 승인 필요로 거절했다는 사실. 목록의 소유 수가 오래됐어도 신청 칸을 띄운다.
    const [approvalNeeded, setApprovalNeeded] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [newProjectDetailDesc, setNewProjectDetailDesc] = useState('');
    const [newProjectFile, setNewProjectFile] = useState<File | null>(null);
    const [newProjectError, setNewProjectError] = useState('');
    // 프로그램은 매니저·관리자가 열고, 그 안의 프로젝트는 참여 멘티가 소유한다.
    // 그래서 새 프로젝트를 만들 때 어느 프로그램의, 어느 멘티 것인지 함께 고른다.
    const [programs, setPrograms] = useState<ProgramOption[]>([]);
    const [mentees, setMentees] = useState<MenteeOption[]>([]);
    const [newProjectProgramId, setNewProjectProgramId] = useState('');
    const [newProjectOwnerMenteeId, setNewProjectOwnerMenteeId] = useState('');

    // 승인을 골라 여는 경우(멘티의 "승인으로 개설")에는 지난 오류를 지우고 연다(예전과 같다).
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open && approvalRequestId) setNewProjectError('');
    }

    // 남을 소유자로 지정해 만드는 역할만 프로그램 목록이 필요하다. 멘티는 자기
    // 프로그램에 자기 것으로만 만들어 고를 것이 없고, /api/programs 도 403 이다.
    useEffect(() => {
        if (!role || !canCreateProjectForOthers(role)) return;
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

    useEffect(() => {
        if (role !== 'MENTOR' || !open) return;
        let cancelled = false;
        setLoadingCreationOptions(true);
        setMentorMentees([]);
        setNewProjectOwnerMenteeId('');
        onApprovalRequestIdChange('');
        setNewProjectError('');
        fetch('/api/projects/creation-options')
            .then(async res => {
                const data = await readJsonOrThrow(res, '배정 멘티를 불러오지 못했습니다.');
                if (!cancelled) setMentorMentees(data.mentees);
            })
            .catch(error => { if (!cancelled) setNewProjectError(error.message); })
            .finally(() => { if (!cancelled) setLoadingCreationOptions(false); });
        return () => { cancelled = true; };
    }, [role, open, onApprovalRequestIdChange]);

    // 멘티는 자기 것만, 관리자·매니저는 남의 것도 만든다. 창이 프로그램·소유자 선택을 보여줄지 정한다.
    const createsForOthers = role !== null && canCreateProjectForOthers(role);
    // 서버(lib/project-creation-approval.ts)와 같은 기준 — 소유 프로젝트가 있으면 승인이 있어야 만든다.
    const menteeNeedsApproval = role === 'MENTEE' && !approvalRequestId && (approvalNeeded || ownsProject);
    const selectedMentorMentee = mentorMentees.find(mentee => mentee.id === newProjectOwnerMenteeId);

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        setNewProjectError('');
        setIsCreatingProject(true);
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
                    approvalRequestId: approvalRequestId || undefined,
                    // 멘티는 보내지 않는다. 서버가 본인 프로그램·본인 소유로 정한다.
                    ...(createsForOthers
                        ? { programId: newProjectProgramId, ownerMenteeId: newProjectOwnerMenteeId }
                        : role === 'MENTOR' ? { ownerMenteeId: newProjectOwnerMenteeId } : {}),
                }),
            });
            // 작성 중 세션이 만료된 경우에도 오류 문구 대신 로그인으로 보낸다.
            if (redirectToLoginOn401(response)) return;
            const data = await response.json().catch(() => null);
            // 멘티는 이 창에서 바로 신청하게 한다. 오류 문구만 남기면 신청이 접수된 줄 안다.
            if (!response.ok && data?.approvalRequired && role === 'MENTEE') {
                setApprovalNeeded(true);
                return;
            }
            if (!response.ok) throw new Error(data?.error || '프로젝트 생성에 실패했습니다.');
            onCreated(data.project);
            onApprovalRequestIdChange('');
            setNewProjectName('');
            setNewProjectDesc('');
            setNewProjectDetailDesc('');
            setNewProjectFile(null);
            setNewProjectOwnerMenteeId('');
        } catch (error) {
            console.error(error);
            setNewProjectError(error instanceof Error ? error.message : '프로젝트 생성에 실패했습니다.');
        } finally {
            setIsCreatingProject(false);
        }
    };

    // 입력한 이름·설명은 남겨 둔다. 승인 후 다시 열면 그대로 이어 쓴다.
    const handleApprovalRequested = () => {
        setApprovalNeeded(false);
        onApprovalRequested();
    };

    if (!open) return null;

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal-content max-w-lg">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-display font-bold text-white">새 프로젝트</h3>
                    <button
                        onClick={onClose}
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
                    {menteeNeedsApproval && (
                        <ProjectApprovalRequestBox
                            defaultReason={newProjectName ? `「${newProjectName}」 프로젝트를 추가로 개설하고자 합니다.` : ''}
                            onRequested={handleApprovalRequested}
                        />
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

                    {/* 멘티는 자기 프로그램에 자기 것으로만 만든다. 고를 여지가
                        없으므로 이 두 칸을 아예 보여주지 않는다. */}
                    {role === 'MENTOR' && (
                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-400" htmlFor="mentor-owner">소유할 배정 멘티</label>
                            <select id="mentor-owner" className="input" required disabled={loadingCreationOptions} value={newProjectOwnerMenteeId}
                                onChange={e => { setNewProjectOwnerMenteeId(e.target.value); onApprovalRequestIdChange(''); }}>
                                <option value="">{loadingCreationOptions ? '불러오는 중...' : '배정 멘티를 선택하세요'}</option>
                                {mentorMentees.map(mentee => <option key={mentee.id} value={mentee.id}>{mentee.name} ({mentee.email}) · {mentee.program.name}</option>)}
                            </select>
                            <p className="text-xs text-gray-400">프로젝트는 선택한 멘티 소유로 개설됩니다. 두 번째부터는 프로그램 매니저의 개별 승인이 필요합니다.</p>
                            {!loadingCreationOptions && mentorMentees.length === 0 && <p className="text-xs text-amber-400">개설 가능한 배정 멘티가 없습니다. 관리자 또는 프로그램 매니저에게 배정을 요청하세요.</p>}
                            {selectedMentorMentee && selectedMentorMentee.ownedProjectCount > 0 && (
                                <>
                                    <label className="block text-sm font-medium text-gray-400" htmlFor="mentor-approval">추가 프로젝트 개설 승인</label>
                                    <select id="mentor-approval" className="input" required value={approvalRequestId} onChange={e => onApprovalRequestIdChange(e.target.value)}>
                                        <option value="">사용할 승인을 선택하세요</option>
                                        {selectedMentorMentee.approvals.map((approval, index) => <option key={approval.id} value={approval.id}>승인 {index + 1} · {approval.reason}</option>)}
                                    </select>
                                    {selectedMentorMentee.approvals.length === 0 && <p className="text-xs text-amber-400">사용 가능한 승인이 없습니다. 멘티가 추가 개설을 신청하고 프로그램 매니저의 승인을 받은 뒤 다시 열어 주세요.</p>}
                                </>
                            )}
                        </div>
                    )}
                    {createsForOthers && (
                        <>
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
                        </>
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

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => {
                                onClose();
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
                            disabled={isCreatingProject || !creationAllowed || menteeNeedsApproval || (role === 'MENTOR' && (loadingCreationOptions || !selectedMentorMentee || (selectedMentorMentee.ownedProjectCount > 0 && !approvalRequestId)))}
                            className="flex-1 btn-primary py-3 disabled:opacity-50"
                        >
                            {isCreatingProject ? (
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
    );
}
