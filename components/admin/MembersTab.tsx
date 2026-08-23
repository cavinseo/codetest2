'use client';
// 회원 목록·역할 변경·승인·기간 연장·계정 생성 UI. 관리자 전용이며 상태는 app/admin/page.tsx 가 갖는다.

import { useState } from 'react';
import ProfileFields, { EMPTY_PROFILE, toProfilePayload, type ProfileValue } from '@/components/member/ProfileFields';
import {
    MEMBER_ROLES, MEMBER_ROLE_LABELS, canTransitionRole,
    DEFAULT_ACCESS_DURATION_DAYS, type MemberRole,
} from '@/lib/member-roles';

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
}

export interface CreateMemberPayload {
    name: string;
    email: string;
    role: 'MENTOR' | 'MENTEE';
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
}

export default function MembersTab({
    members, onApprove, onRequestDelete, onSetRole, onExtendAccess, onCreate,
}: MembersTabProps) {
    const [searchMember, setSearchMember] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [newMember, setNewMember] = useState({ name: '', email: '', role: 'MENTEE' as 'MENTOR' | 'MENTEE' });
    const [newProfile, setNewProfile] = useState<ProfileValue>(EMPTY_PROFILE);
    const [isCreating, setIsCreating] = useState(false);

    const filteredMembers = members.filter(
        (m) => m.name.toLowerCase().includes(searchMember.toLowerCase()) || m.email.toLowerCase().includes(searchMember.toLowerCase())
    );

    const handleCreate = async () => {
        setIsCreating(true);
        try {
            const ok = await onCreate({
                ...newMember,
                profile: toProfilePayload(newProfile, newMember.role),
            });
            if (ok) {
                setShowCreate(false);
                setNewMember({ name: '', email: '', role: 'MENTEE' });
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
                        placeholder="이름 또는 이메일 검색..."
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
                            이메일
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
                    </div>
                    <ProfileFields role={newMember.role} value={newProfile} onChange={setNewProfile} showConsent={false} />
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={isCreating || !newMember.name || !newMember.email}
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
