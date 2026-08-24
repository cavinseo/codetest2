'use client';
// 회원 목록·역할 변경·승인·기간 연장·계정 생성 UI. 관리자 전용이며 상태는 app/admin/page.tsx 가 갖는다.

import { useEffect, useState } from 'react';
import ProfileFields, { EMPTY_PROFILE, toProfilePayload, type ProfileValue } from '@/components/member/ProfileFields';
import {
    MEMBER_ROLES, MEMBER_ROLE_LABELS, canTransitionRole,
    DEFAULT_ACCESS_DURATION_DAYS, type MemberRole,
} from '@/lib/member-roles';

interface ProgramOption {
    id: string;
    name: string;
    organization: string;
}

export interface User {
    id: string;
    name: string;
    email: string;
    status: 'PENDING' | 'APPROVED';
    isAdmin: boolean;
    role: MemberRole;
    accessExpiresAt: string | null;
    mustChangePassword: boolean;
    createdAt: string;
    updatedAt: string;
    /** 멘티만 프로그램에 속한다. 다른 역할은 항상 null 이다. */
    programId?: string | null;
    programName?: string | null;
}

/** 역할별로 나눠 보는 필터. '전체' 를 앞에 두고 나머지는 역할 순서를 따른다. */
const ROLE_FILTERS = ['ALL', ...MEMBER_ROLES] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number];

const ROLE_FILTER_LABELS: Record<RoleFilter, string> = {
    ALL: '전체',
    ...MEMBER_ROLE_LABELS,
};

export interface CreateMemberPayload {
    name: string;
    email: string;
    role: 'MENTOR' | 'MENTEE';
    // 멘티 계정에만 의미가 있다. 비워 두면 프로그램 없이 만들어지고, 프로젝트
    // 소유자로 지정될 때까지는 그 상태로 남는다.
    programId?: string;
    profile: Record<string, unknown>;
}

/** 현재 역할에서 고를 수 있는 다음 역할. 서버의 canTransitionRole 과 같은 규칙을 그대로 쓴다. */
function allowedRoleTargets(current: MemberRole): MemberRole[] {
    return MEMBER_ROLES.filter((role) => canTransitionRole(current, role));
}

interface MembersTabProps {
    members: User[];
    onApprove: (userId: string, action: 'approve' | 'revoke') => void;
    onRequestDelete: (user: { id: string; name: string }) => void;
    onSetRole: (userId: string, role: MemberRole) => void;
    onExtendAccess: (userId: string, days: number) => void;
    onCreate: (payload: CreateMemberPayload) => Promise<boolean>;
    /** 멘티를 프로그램에 배정한 뒤 목록을 다시 받아오기 위해 부른다. */
    onReload: () => void;
}

export default function MembersTab({
    members, onApprove, onRequestDelete, onSetRole, onExtendAccess, onCreate, onReload,
}: MembersTabProps) {
    const [searchMember, setSearchMember] = useState('');
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
    const [showCreate, setShowCreate] = useState(false);
    const [newMember, setNewMember] = useState({ name: '', email: '', role: 'MENTEE' as 'MENTOR' | 'MENTEE', programId: '' });
    const [newProfile, setNewProfile] = useState<ProfileValue>(EMPTY_PROFILE);
    const [isCreating, setIsCreating] = useState(false);
    const [programs, setPrograms] = useState<ProgramOption[]>([]);
    const [assignBusy, setAssignBusy] = useState<Record<string, boolean>>({});
    const [assignError, setAssignError] = useState('');

    // 멘티 계정을 만들 때 프로그램을 고를 수 있게, 목록을 미리 받아 둔다.
    // 멘토 계정 생성에는 쓰지 않지만 한 번만 불러오면 되므로 마운트 시 가져온다.
    useEffect(() => {
        fetch('/api/programs')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => { if (data) setPrograms(data.programs); })
            .catch(() => { /* 프로그램 없이도 멘토 계정은 만들 수 있어야 하므로 조용히 무시한다 */ });
    }, []);

    const roleCounts = MEMBER_ROLES.reduce(
        (acc, role) => ({ ...acc, [role]: members.filter((m) => m.role === role).length }),
        {} as Record<MemberRole, number>
    );

    const filteredMembers = members
        .filter((m) => roleFilter === 'ALL' || m.role === roleFilter)
        .filter(
            (m) => m.name.toLowerCase().includes(searchMember.toLowerCase()) || m.email.toLowerCase().includes(searchMember.toLowerCase())
        );

    /**
     * 기존 멘티를 프로그램에 배정한다. 프로그램 화면과 같은 엔드포인트를 써서
     * "이미 다른 프로그램 소속이면 한 번 더 확인" 규칙이 여기서도 그대로 적용된다.
     */
    const assignProgram = async (userId: string, programId: string) => {
        setAssignBusy((prev) => ({ ...prev, [userId]: true }));
        setAssignError('');
        try {
            const attempt = (confirmReassign: boolean) => fetch(`/api/programs/${programId}/mentees`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, ...(confirmReassign ? { confirmReassign: true } : {}) }),
            });

            let res = await attempt(false);
            let data = await res.json().catch(() => null);

            if (res.status === 409 && data?.needsReassignConfirm) {
                if (!window.confirm(data.error)) return;
                res = await attempt(true);
                data = await res.json().catch(() => null);
            }

            if (!res.ok) throw new Error(data?.error || '프로그램 배정에 실패했습니다.');
            onReload();
        } catch (error) {
            setAssignError(error instanceof Error ? error.message : '프로그램 배정에 실패했습니다.');
        } finally {
            setAssignBusy((prev) => ({ ...prev, [userId]: false }));
        }
    };

    const handleCreate = async () => {
        setIsCreating(true);
        try {
            const ok = await onCreate({
                name: newMember.name,
                email: newMember.email,
                role: newMember.role,
                ...(newMember.role === 'MENTEE' && newMember.programId ? { programId: newMember.programId } : {}),
                profile: toProfilePayload(newProfile, newMember.role),
            });
            if (ok) {
                setShowCreate(false);
                setNewMember({ name: '', email: '', role: 'MENTEE', programId: '' });
                setNewProfile(EMPTY_PROFILE);
            }
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 max-w-sm">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input
                        type="text"
                        placeholder="이름 또는 ID 검색..."
                        value={searchMember}
                        onChange={(e) => setSearchMember(e.target.value)}
                        className="input pl-10 w-full"
                        id="admin-member-search"
                    />
                </div>
                <span className="text-sm text-gray-500">{filteredMembers.length}명</span>
                <button
                    type="button"
                    onClick={() => setShowCreate((v) => !v)}
                    className="btn-secondary text-sm ml-auto"
                    id="admin-member-create-toggle"
                >
                    {showCreate ? '닫기' : '계정 생성'}
                </button>
            </div>

            {/* 역할별로 나눠 본다. 한 표에 섞여 있으면 누가 매니저이고 누가
                멘티인지 한눈에 들어오지 않는다. */}
            <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/[0.06] rounded-2xl w-fit">
                {ROLE_FILTERS.map((filter) => (
                    <button
                        key={filter}
                        type="button"
                        onClick={() => setRoleFilter(filter)}
                        className={roleFilter === filter ? 'nav-tab-active' : 'nav-tab'}
                        id={`admin-member-filter-${filter}`}
                    >
                        {ROLE_FILTER_LABELS[filter]}
                        <span className="ml-1.5 text-[11px] opacity-70">
                            {filter === 'ALL' ? members.length : roleCounts[filter]}
                        </span>
                    </button>
                ))}
            </div>

            {assignError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {assignError}
                </div>
            )}

            {showCreate && (
                <div className="card space-y-4">
                    <h3 className="text-sm font-bold text-white">멘토·멘티 계정 생성</h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block text-sm font-medium text-gray-400">
                            이름
                            <input className="input mt-2" value={newMember.name}
                                onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} />
                        </label>
                        <label className="block text-sm font-medium text-gray-400">
                            ID
                            <input type="email" className="input mt-2" value={newMember.email}
                                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} />
                        </label>
                        <label className="block text-sm font-medium text-gray-400">
                            역할
                            <select className="input mt-2" value={newMember.role}
                                onChange={(e) => setNewMember({ ...newMember, role: e.target.value as 'MENTOR' | 'MENTEE' })}>
                                <option value="MENTEE">{MEMBER_ROLE_LABELS.MENTEE}</option>
                                <option value="MENTOR">{MEMBER_ROLE_LABELS.MENTOR}</option>
                            </select>
                        </label>
                        {newMember.role === 'MENTEE' && (
                            <label className="block text-sm font-medium text-gray-400">
                                프로그램 <span className="text-gray-600">(선택)</span>
                                <select className="input mt-2" value={newMember.programId}
                                    onChange={(e) => setNewMember({ ...newMember, programId: e.target.value })}
                                    id="admin-member-create-program">
                                    <option value="">지정 안 함</option>
                                    {programs.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name} ({p.organization})</option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>
                    <ProfileFields
                        role={newMember.role}
                        value={newProfile}
                        onChange={setNewProfile}
                        consentLabel="본인에게 개인정보 수집·이용 동의를 받았습니다."
                    />
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={isCreating || !newMember.name || !newMember.email || !newProfile.privacyConsent}
                            className="btn-primary text-sm disabled:opacity-50"
                            id="admin-member-create-submit"
                        >
                            {isCreating ? '만드는 중...' : '계정 만들기'}
                        </button>
                    </div>
                </div>
            )}

            {filteredMembers.length === 0 ? (
                <div className="card text-center py-16">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    </div>
                    <p className="text-gray-500 text-sm">{searchMember ? '검색 결과가 없습니다' : '등록된 회원이 없습니다'}</p>
                </div>
            ) : (
                <div className="card overflow-hidden p-0">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">사용자</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">역할</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">프로그램</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">승인 상태</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">이용 만료</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">가입일</th>
                                <th className="px-5 py-3.5" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {filteredMembers.map((m) => (
                                <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500/30 to-accent-500/30 flex items-center justify-center text-sm font-bold text-white">
                                                {m.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">
                                                    {m.name}
                                                    {m.isAdmin && <span className="ml-2 badge-amber text-[10px]">관리자</span>}
                                                    {m.mustChangePassword && <span className="ml-2 badge-purple text-[10px]">비밀번호 변경 필요</span>}
                                                </p>
                                                <p className="text-xs text-gray-500">{m.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <select
                                            value={m.role}
                                            onChange={(e) => onSetRole(m.id, e.target.value as MemberRole)}
                                            className="input w-auto py-1.5 px-3 text-xs"
                                            id={`admin-member-role-${m.id}`}
                                        >
                                            {allowedRoleTargets(m.role).map((r) => (
                                                <option key={r} value={r}>{MEMBER_ROLE_LABELS[r]}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-5 py-4">
                                        {/* 프로그램에 속하는 것은 멘티뿐이다. 이미 등록된 멘티도
                                            여기서 바로 배정하거나 옮길 수 있다. */}
                                        {m.role !== 'MENTEE' ? (
                                            <span className="text-xs text-gray-600">—</span>
                                        ) : programs.length === 0 ? (
                                            <span className="text-xs text-gray-600">개설된 프로그램 없음</span>
                                        ) : (
                                            <select
                                                value={m.programId ?? ''}
                                                onChange={(e) => { if (e.target.value) assignProgram(m.id, e.target.value); }}
                                                disabled={assignBusy[m.id]}
                                                className="input w-auto py-1.5 px-3 text-xs disabled:opacity-50"
                                                id={`admin-member-program-${m.id}`}
                                            >
                                                <option value="">미배정</option>
                                                {programs.map((p) => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        {m.status === 'APPROVED' ? (
                                            <span className="badge-emerald text-[10px]">승인됨</span>
                                        ) : (
                                            <span className="badge-rose text-[10px]">승인 대기</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className="text-xs text-gray-500">
                                            {m.accessExpiresAt ? new Date(m.accessExpiresAt).toLocaleDateString('ko-KR') : '무기한'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 hidden md:table-cell">
                                        <span className="text-xs text-gray-500">{new Date(m.createdAt).toLocaleDateString('ko-KR')}</span>
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        <div className="inline-flex items-center gap-2">
                                            {m.status === 'PENDING' ? (
                                                <button
                                                    onClick={() => onApprove(m.id, 'approve')}
                                                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                                                    id={`admin-approve-user-${m.id}`}
                                                >
                                                    승인
                                                </button>
                                            ) : !m.isAdmin && (
                                                <button
                                                    onClick={() => onApprove(m.id, 'revoke')}
                                                    className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
                                                    id={`admin-revoke-user-${m.id}`}
                                                >
                                                    승인 취소
                                                </button>
                                            )}
                                            {m.accessExpiresAt && (
                                                <button
                                                    onClick={() => onExtendAccess(m.id, DEFAULT_ACCESS_DURATION_DAYS)}
                                                    className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-gray-300 hover:bg-white/[0.08] transition-colors"
                                                    id={`admin-extend-access-${m.id}`}
                                                >
                                                    {DEFAULT_ACCESS_DURATION_DAYS}일 연장
                                                </button>
                                            )}
                                            <button
                                                onClick={() => onRequestDelete({ id: m.id, name: m.name })}
                                                className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors"
                                                id={`admin-delete-user-${m.id}`}
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
