'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PASSWORD_MIN_LENGTH, getPasswordChangeError } from '@/lib/password-policy';
import MembersTab, { type User } from '@/components/admin/MembersTab';
import InvitesTab from '@/components/admin/InvitesTab';
import MentorAssign from '@/components/admin/MentorAssign';
import { MEMBER_ROLE_LABELS, canAssignMentor, canIssueInviteCode, type MemberRole } from '@/lib/member-roles';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Project {
    id: string;
    name: string;
    description?: string;
    ownerId: string;
    createdAt: string;
    updatedAt: string;
    ownerEmail: string | null;
    ownerName: string | null;
    reqCount: number;
    responseCount: number;
    memberCount: number;
}

interface Stats {
    totalProjects: number;
    totalUsers: number;
    totalRequirements: number;
    totalResponses: number;
    kanoDistribution: Record<string, number>;
    recentProjects: Array<{ id: string; name: string; createdAt: string }>;
}

type Tab = 'overview' | 'members' | 'invites' | 'projects' | 'password';

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminModePage() {
    const router = useRouter();
    const [tab, setTab] = useState<Tab>('overview');
    const [stats, setStats] = useState<Stats | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchProject, setSearchProject] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<{ type: 'user' | 'project'; id: string; name: string } | null>(null);
    const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [accessDenied, setAccessDenied] = useState(false);
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [role, setRole] = useState<MemberRole | null>(null);
    const [openMentorAssign, setOpenMentorAssign] = useState<Record<string, boolean>>({});
    const [loadedAt, setLoadedAt] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [statsRes, usersRes, projectsRes, meRes] = await Promise.all([
                fetch('/api/admin/stats'),
                fetch('/api/admin/users'),
                fetch('/api/admin/projects'),
                fetch('/api/me/profile'),
            ]);

            // 미로그인은 관리자 로그인창으로, 로그인은 했지만 권한이 없으면 안내 화면으로 보낸다.
            if (statsRes.status === 401) {
                router.replace('/admin/login');
                return;
            }
            if (statsRes.status === 403) {
                setAccessDenied(true);
                return;
            }

            if (statsRes.ok) setStats(await statsRes.json());
            if (usersRes.ok) { const d = await usersRes.json(); setUsers(d.users); }
            if (projectsRes.ok) { const d = await projectsRes.json(); setProjects(d.projects); }
            if (meRes.ok) {
                const d = await meRes.json();
                setRole(d.role ?? null);
            }
        } finally {
            setLoading(false);
            // 마지막 갱신 시각은 브라우저에서만 정한다. 렌더 중에 new Date() 를
            // 부르면 서버가 찍은 시각이 HTML 에 박혀 hydration 이 어긋난다.
            setLoadedAt(new Date().toLocaleString('ko-KR'));
        }
    }, [router]);

    useEffect(() => { load(); }, [load]);

    const showMsg = (type: 'success' | 'error', msg: string) => {
        setActionMsg({ type, msg });
        setTimeout(() => setActionMsg(null), 3500);
    };

    const handleDeleteUser = async (userId: string, confirmCascade = false) => {
        const res = await fetch('/api/admin/users', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, ...(confirmCascade ? { confirmCascade: true } : {}) }),
        });
        const data = await res.json().catch(() => null);

        // 소유 프로젝트가 있으면 서버가 409 로 막는다. 실제 건수를 보여주고 한 번 더 받는다.
        if (res.status === 409 && data?.needsCascadeConfirm) {
            setConfirmDelete(null);
            if (window.confirm(`${data.error}\n\n그래도 삭제하시겠습니까?`)) {
                await handleDeleteUser(userId, true);
            }
            return;
        }

        if (res.ok) {
            setUsers((prev) => prev.filter((u) => u.id !== userId));
            showMsg('success', '사용자가 삭제되었습니다.');
        } else {
            showMsg('error', data?.error || '삭제 실패');
        }
        setConfirmDelete(null);
    };

    const handleApproval = async (userId: string, action: 'approve' | 'revoke') => {
        const res = await fetch('/api/admin/users', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok) {
            setUsers((prev) => prev.map((u) => (
                u.id === userId ? { ...u, status: action === 'approve' ? 'APPROVED' : 'PENDING' } : u
            )));
            showMsg('success', action === 'approve' ? '가입을 승인했습니다.' : '승인을 취소했습니다.');
        } else {
            showMsg('error', data?.error || '승인 상태 변경에 실패했습니다.');
        }
    };

    const handleSetRole = async (userId: string, role: MemberRole) => {
        const res = await fetch('/api/admin/users', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action: 'setRole', role }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok) {
            setUsers((prev) => prev.map((u) => (
                u.id === userId ? { ...u, role: data.user.role, isAdmin: data.user.isAdmin } : u
            )));
            showMsg('success', `역할을 ${MEMBER_ROLE_LABELS[role]}(으)로 변경했습니다.`);
        } else {
            showMsg('error', data?.error || '역할 변경에 실패했습니다.');
        }
    };

    const handleExtendAccess = async (userId: string, days: number) => {
        const res = await fetch('/api/admin/users', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action: 'extendAccess', days }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok) {
            setUsers((prev) => prev.map((u) => (
                u.id === userId ? { ...u, accessExpiresAt: data.user.accessExpiresAt } : u
            )));
            showMsg('success', `이용 기간을 ${days}일 연장했습니다.`);
        } else {
            showMsg('error', data?.error || '기간 연장에 실패했습니다.');
        }
    };

    const handleCreateMember = async (payload: {
        name: string; email: string; role: 'MENTOR' | 'MENTEE'; profile: Record<string, unknown>;
    }): Promise<boolean> => {
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            showMsg('error', data?.error || '계정 생성에 실패했습니다.');
            return false;
        }
        // 메일이 안 가면 서버가 내려준 복구 안내(계정 삭제 후 재생성)를 그대로 보여준다.
        // 여기서 다른 문구를 지어내면(예: 재설정 안내) 실제 복구 절차와 어긋난다.
        showMsg('success', data.emailSent
            ? '계정을 만들고 임시 비밀번호를 보냈습니다.'
            : data.message);
        await load();
        return true;
    };

    const handleDeleteProject = async (projectId: string) => {
        const res = await fetch('/api/admin/projects', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId }),
        });
        if (res.ok) {
            setProjects((prev) => prev.filter((p) => p.id !== projectId));
            if (stats) setStats((prev) => prev ? { ...prev, totalProjects: prev.totalProjects - 1 } : prev);
            showMsg('success', '프로젝트와 모든 연관 데이터가 삭제되었습니다.');
        } else {
            showMsg('error', '삭제 실패');
        }
        setConfirmDelete(null);
    };

    const handleChangePassword = async (event: React.FormEvent) => {
        event.preventDefault();
        setPasswordMsg(null);

        // 서버에 보내기 전에 같은 규칙으로 한 번 걸러 왕복을 줄인다.
        const localError = getPasswordChangeError(passwordForm);
        if (localError) {
            setPasswordMsg({ type: 'error', msg: localError });
            return;
        }

        setIsChangingPassword(true);
        try {
            const res = await fetch('/api/admin/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(passwordForm),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setPasswordMsg({ type: 'error', msg: data?.error || '비밀번호 변경에 실패했습니다.' });
                return;
            }
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setPasswordMsg({ type: 'success', msg: data?.message || '비밀번호를 변경했습니다.' });
        } catch {
            setPasswordMsg({ type: 'error', msg: '비밀번호 변경에 실패했습니다.' });
        } finally {
            setIsChangingPassword(false);
        }
    };

    // 초대 발행·멘토 배정 API 는 시스템 역할(canIssueInviteCode/canAssignMentor)로
    // 막는다. ADMIN_EMAILS 로 들어온 MENTEE 계정이 이 컨트롤을 열면 API 가 403 을
    // 주므로, 화면도 같은 역할 기준으로 감춘다. 화면 전체 접근은 서버 requireAdmin(403)이 막는다.
    const canInvite = role !== null && canIssueInviteCode(role);
    const canAssignMentorUI = role !== null && canAssignMentor(role);

    const toggleMentorAssign = (projectId: string) => {
        setOpenMentorAssign((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
    };

    const filteredProjects = projects.filter((p) => {
        const q = searchProject.toLowerCase();
        return (
            p.name.toLowerCase().includes(q) ||
            (p.ownerEmail ?? '').toLowerCase().includes(q) ||
            (p.ownerName ?? '').toLowerCase().includes(q)
        );
    });

    const allTabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        {
            id: 'overview', label: '개요',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
        },
        {
            id: 'members', label: `회원 관리 (${users.length})`,
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
        },
        {
            id: 'invites', label: '초대 관리',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
        },
        {
            id: 'projects', label: `프로젝트 관리 (${projects.length})`,
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>,
        },
        {
            id: 'password', label: '비밀번호 변경',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
        },
    ];
    // 초대 발행 권한이 없는 역할에게는 초대 관리 탭 자체를 감춘다(/api/invites 가 403).
    const tabs = allTabs.filter((t) => t.id !== 'invites' || canInvite);

    const statItems = [
        { label: '총 프로젝트', value: stats?.totalProjects ?? 0, unit: '개', gradient: 'from-blue-500/20 to-cyan-500/20', color: 'text-blue-400' },
        { label: '총 사용자', value: stats?.totalUsers ?? 0, unit: '명', gradient: 'from-emerald-500/20 to-teal-500/20', color: 'text-emerald-400' },
        { label: '총 요구사항', value: stats?.totalRequirements ?? 0, unit: '개', gradient: 'from-purple-500/20 to-pink-500/20', color: 'text-purple-400' },
        { label: '총 설문 응답', value: stats?.totalResponses ?? 0, unit: '개', gradient: 'from-amber-500/20 to-orange-500/20', color: 'text-amber-400' },
    ];

    const kanoMeta: Record<string, { label: string; color: string; bg: string }> = {
        M: { label: 'Must-be', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
        O: { label: 'One-Dim', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
        A: { label: 'Attractive', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
        I: { label: 'Indifferent', color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20' },
        R: { label: 'Reverse', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
        Q: { label: 'Question', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    };

    if (accessDenied) {
        return (
            <div className="min-h-screen bg-surface-900 bg-grid relative flex items-center justify-center px-4">
                <div className="bg-orb w-[500px] h-[500px] bg-rose-500/40 top-[-150px] right-[-100px] opacity-10" />
                <div className="glass-strong relative z-10 w-full max-w-md p-8 text-center animate-fade-in">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-3xl">
                        🔒
                    </div>
                    <h1 className="mb-2 text-2xl font-display font-bold text-white">관리자 권한이 없습니다</h1>
                    <p className="mb-8 text-sm leading-relaxed text-gray-400">
                        지금 로그인한 계정은 관리자로 지정되어 있지 않습니다.
                        <br />
                        관리자 계정으로 다시 로그인하거나 일반 화면으로 돌아가세요.
                    </p>
                    <div className="flex flex-col gap-3">
                        <Link href="/admin/login" className="btn-primary py-3 text-sm font-semibold">
                            관리자 계정으로 로그인
                        </Link>
                        <Link href="/dashboard" className="btn-secondary py-3 text-sm">
                            일반 화면으로 돌아가기
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative">
            <div className="bg-orb w-[500px] h-[500px] bg-primary-600/40 top-[-200px] left-[5%] opacity-10" />

            {/* Header */}
            <header className="relative z-10 glass border-b border-white/[0.06] rounded-none sticky top-0">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="btn-ghost text-sm flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            대시보드
                        </Link>
                        <div className="w-px h-6 bg-white/10" />
                        <div>
                            <h1 className="text-xl font-display font-bold text-white flex items-center gap-2">
                                <span className="w-6 h-6 rounded-md bg-gradient-to-br from-rose-500/30 to-orange-500/30 flex items-center justify-center text-xs">🛡️</span>
                                관리자모드
                            </h1>
                            <p className="text-xs text-gray-500 mt-0.5">시스템 관리 및 분석</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            {loadedAt}
                        </div>
                        <button
                            onClick={load}
                            className="btn-ghost text-sm flex items-center gap-1.5"
                            id="admin-refresh-btn"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            새로고침
                        </button>
                    </div>
                </div>
            </header>

            {/* Action toast */}
            {actionMsg && (
                <div className={`fixed top-20 right-6 z-50 px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-300 shadow-xl ${actionMsg.type === 'success'
                        ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/20 border-rose-500/30 text-rose-300'
                    }`}>
                    {actionMsg.msg}
                </div>
            )}

            {/* Delete Confirm Modal */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="card max-w-sm w-full mx-4 border-rose-500/20">
                        <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center mb-4">
                            <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">
                            {confirmDelete.type === 'user' ? '사용자 삭제' : '프로젝트 삭제'}
                        </h3>
                        <p className="text-sm text-gray-400 mb-1">
                            <span className="text-white font-medium">&quot;{confirmDelete.name}&quot;</span>을(를) 삭제하시겠습니까?
                        </p>
                        {confirmDelete.type === 'project' && (
                            <p className="text-xs text-rose-400 mt-1 mb-4">⚠️ 프로젝트의 모든 데이터(요구사항, QFD, Kano 응답 등)가 함께 삭제됩니다.</p>
                        )}
                        {confirmDelete.type === 'user' && (
                            <p className="text-xs text-amber-400 mt-1 mb-4">⚠️ 이 작업은 되돌릴 수 없습니다.</p>
                        )}
                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="btn-ghost flex-1"
                            >
                                취소
                            </button>
                            <button
                                onClick={() => confirmDelete.type === 'user'
                                    ? handleDeleteUser(confirmDelete.id)
                                    : handleDeleteProject(confirmDelete.id)
                                }
                                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-sm font-medium hover:bg-rose-500/30 transition-colors"
                                id="admin-confirm-delete-btn"
                            >
                                삭제
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 page-enter">

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/[0.06] rounded-2xl mb-8 w-fit">
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            id={`admin-tab-${t.id}`}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${tab === t.id
                                    ? 'bg-primary-500/20 text-white border border-primary-500/30 shadow-lg shadow-primary-500/10'
                                    : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            {t.icon}
                            {t.label}
                        </button>
                    ))}
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
                        {/* ── Overview Tab ─────────────────────────────── */}
                        {tab === 'overview' && (
                            <div className="space-y-6">
                                {/* 통계 카드 */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {statItems.map((s) => (
                                        <div key={s.label} className="stat-card">
                                            <div className={`text-3xl font-display font-bold ${s.color}`}>
                                                {s.value}<span className="text-sm text-gray-500 ml-1">{s.unit}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-2">{s.label}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Kano 분포 */}
                                {stats && (
                                    <div className="card">
                                        <div className="flex items-center gap-3 mb-5">
                                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center">
                                                <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                            </div>
                                            <h2 className="text-base font-bold text-white">Kano 카테고리 분포</h2>
                                        </div>
                                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                                            {Object.entries(stats.kanoDistribution).map(([cat, count]) => {
                                                const m = kanoMeta[cat] || { label: cat, color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20' };
                                                return (
                                                    <div key={cat} className={`rounded-xl border p-4 text-center ${m.bg}`}>
                                                        <div className={`text-2xl font-bold ${m.color}`}>{count}</div>
                                                        <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">{cat} · {m.label}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="bg-primary-500/5 border border-primary-500/10 rounded-xl p-3">
                                            <p className="text-xs text-gray-400">
                                                <span className="text-primary-400 font-semibold">분석: </span>
                                                전체 {Object.values(stats.kanoDistribution).reduce((a, b) => a + b, 0)}개의 응답이 수집되었습니다.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* 최근 프로젝트 + 시스템 정보 */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* 최근 프로젝트 */}
                                    <div className="card">
                                        <div className="flex items-center gap-3 mb-5">
                                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                                                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                            </div>
                                            <h2 className="text-base font-bold text-white">최근 프로젝트</h2>
                                        </div>
                                        {stats && stats.recentProjects && stats.recentProjects.length > 0 ? (
                                            <div className="space-y-2">
                                                {stats.recentProjects.map((project) => (
                                                    <Link
                                                        key={project.id}
                                                        href={`/project/${project.id}`}
                                                        className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-200"
                                                    >
                                                        <div>
                                                            <p className="text-sm font-medium text-white">{project.name}</p>
                                                            <p className="text-[10px] text-gray-600 mt-1">{new Date(project.createdAt).toLocaleDateString('ko-KR')}</p>
                                                        </div>
                                                        <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                    </Link>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-gray-500 text-center py-8 text-sm">프로젝트가 없습니다</p>
                                        )}
                                    </div>

                                    {/* 시스템 정보 */}
                                    <div className="card">
                                        <div className="flex items-center gap-3 mb-5">
                                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-500/20 to-gray-400/20 flex items-center justify-center">
                                                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>
                                            </div>
                                            <h2 className="text-base font-bold text-white">시스템 정보</h2>
                                        </div>
                                        <div className="space-y-3">
                                            {[
                                                { label: '저장소', value: 'PostgreSQL (Prisma)', status: 'badge-emerald' },
                                                { label: '버전', value: 'v1.0.0', status: 'badge-primary' },
                                                { label: '환경', value: '개발 모드', status: 'badge-purple' },
                                                { label: '상태', value: '정상 작동', status: 'badge-emerald' },
                                            ].map((info) => (
                                                <div key={info.label} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                                    <span className="text-xs text-gray-500">{info.label}</span>
                                                    <span className={`${info.status} text-[10px]`}>{info.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* 빠른 이동 */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setTab('members')}
                                        className="card text-left hover:border-primary-500/30 transition-all duration-200 cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                                                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-white">회원 관리</p>
                                                <p className="text-xs text-gray-500 mt-0.5">총 {users.length}명의 가입 회원</p>
                                            </div>
                                            <svg className="w-4 h-4 text-gray-600 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setTab('projects')}
                                        className="card text-left hover:border-primary-500/30 transition-all duration-200 cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                                                <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-white">프로젝트 관리</p>
                                                <p className="text-xs text-gray-500 mt-0.5">총 {projects.length}개의 프로젝트</p>
                                            </div>
                                            <svg className="w-4 h-4 text-gray-600 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Members Tab ──────────────────────────────── */}
                        {tab === 'members' && (
                            <MembersTab
                                members={users}
                                onApprove={handleApproval}
                                onRequestDelete={(user) => setConfirmDelete({ type: 'user', id: user.id, name: user.name })}
                                onSetRole={handleSetRole}
                                onExtendAccess={handleExtendAccess}
                                onCreate={handleCreateMember}
                            />
                        )}

                        {/* ── Invites Tab ──────────────────────────────── */}
                        {tab === 'invites' && canInvite && <InvitesTab />}

                        {/* ── Projects Tab ─────────────────────────────── */}
                        {tab === 'projects' && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="relative flex-1 max-w-sm">
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
                                    <span className="text-sm text-gray-500">{filteredProjects.length}개</span>
                                </div>

                                {filteredProjects.length === 0 ? (
                                    <div className="card text-center py-16">
                                        <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                                            <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                        </div>
                                        <p className="text-gray-500 text-sm">{searchProject ? '검색 결과가 없습니다' : '등록된 프로젝트가 없습니다'}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {filteredProjects.map((project) => (
                                            <div key={project.id} className="card hover:border-white/[0.1] transition-all duration-200">
                                                <div className="flex items-start justify-between gap-4">
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
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <Link
                                                            href={`/project/${project.id}`}
                                                            className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-gray-300 hover:bg-white/[0.08] transition-colors"
                                                            id={`admin-view-project-${project.id}`}
                                                        >
                                                            보기
                                                        </Link>
                                                        <button
                                                            onClick={() => setConfirmDelete({ type: 'project', id: project.id, name: project.name })}
                                                            className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors"
                                                            id={`admin-delete-project-${project.id}`}
                                                        >
                                                            삭제
                                                        </button>
                                                    </div>
                                                </div>
                                                {canAssignMentorUI && (
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
                        )}

                        {/* ── Password Tab ─────────────────────────────── */}
                        {tab === 'password' && (
                            <div className="max-w-md">
                                <div className="card">
                                    <h2 className="text-base font-bold text-white mb-1">관리자 비밀번호 변경</h2>
                                    <p className="text-xs text-gray-500 mb-5">
                                        지금 로그인한 계정의 비밀번호만 바꿉니다. 변경 후에도 로그인 상태는 유지됩니다.
                                    </p>

                                    {passwordMsg && (
                                        <div
                                            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${passwordMsg.type === 'success'
                                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                                : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                                                }`}
                                            id="admin-password-message"
                                        >
                                            {passwordMsg.msg}
                                        </div>
                                    )}

                                    <form onSubmit={handleChangePassword} className="space-y-4">
                                        {([
                                            { key: 'currentPassword', label: '현재 비밀번호', autoComplete: 'current-password' },
                                            { key: 'newPassword', label: '새 비밀번호', autoComplete: 'new-password' },
                                            { key: 'confirmPassword', label: '새 비밀번호 확인', autoComplete: 'new-password' },
                                        ] as const).map((field) => (
                                            <label key={field.key} className="block">
                                                <span className="mb-1.5 block text-sm font-medium text-gray-300">{field.label}</span>
                                                <input
                                                    type="password"
                                                    value={passwordForm[field.key]}
                                                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                                    disabled={isChangingPassword}
                                                    autoComplete={field.autoComplete}
                                                    className="input w-full"
                                                    id={`admin-${field.key}`}
                                                />
                                            </label>
                                        ))}

                                        <p className="text-xs text-gray-500">
                                            새 비밀번호는 최소 {PASSWORD_MIN_LENGTH}자 이상이어야 합니다.
                                        </p>

                                        <button
                                            type="submit"
                                            disabled={isChangingPassword}
                                            className="btn-primary w-full disabled:opacity-50"
                                            id="admin-change-password-submit"
                                        >
                                            {isChangingPassword ? '변경 중...' : '비밀번호 변경'}
                                        </button>
                                    </form>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
