'use client';
// 사용자 정보 화면. 헤더의 사용자 이름을 누르면 온다.
//
// 두 가지를 한 화면에서 본다:
//   1) 내 소속 — 역할마다 보는 것이 다르다(lib/affiliation.ts 주석 참고)
//   2) 회원 정보 수정 — 온보딩과 같은 ProfileFields 를 쓴다

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import ProfileFields, { EMPTY_PROFILE, toProfilePayload, type ProfileValue } from '@/components/member/ProfileFields';
import { fromProfileRecord } from '@/lib/member-profile-payload';
import { MEMBER_ROLE_LABELS, type MemberRole } from '@/lib/member-roles';
import type { MentorRef, ProgramRef, ProgramWithProjects } from '@/lib/affiliation';

interface Account {
    name: string | null;
    email: string;
    role: MemberRole;
}

interface Affiliation {
    role: MemberRole;
    program: ProgramRef | null;
    mentors: MentorRef[];
    programs: ProgramWithProjects[];
}

const period = (p: { startsAt: string; endsAt: string }) =>
    `${p.startsAt.slice(0, 10)} ~ ${p.endsAt.slice(0, 10)}`;

export default function ProfilePage() {
    const [account, setAccount] = useState<Account | null>(null);
    const [affiliation, setAffiliation] = useState<Affiliation | null>(null);
    const [profile, setProfile] = useState<ProfileValue>(EMPTY_PROFILE);
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [profileRes, affiliationRes] = await Promise.all([
                fetch('/api/me/profile'),
                fetch('/api/me/affiliation'),
            ]);

            if (profileRes.status === 401) {
                window.location.replace('/login');
                return;
            }

            const profileData = await profileRes.json().catch(() => null);
            if (!profileRes.ok || !profileData) {
                setMessage({ type: 'error', text: profileData?.error || '회원 정보를 불러오지 못했습니다.' });
                return;
            }
            setAccount({ name: profileData.name ?? null, email: profileData.email, role: profileData.role });
            setName(profileData.name ?? '');
            setProfile(fromProfileRecord(profileData.profile));

            const affiliationData = await affiliationRes.json().catch(() => null);
            if (affiliationRes.ok && affiliationData) setAffiliation(affiliationData);
        } catch {
            setMessage({ type: 'error', text: '회원 정보를 불러오지 못했습니다. 연결을 확인하세요.' });
        } finally {
            // 실패해도 반드시 로딩을 벗어난다. 아니면 화면이 "불러오는 중" 에 갇힌다.
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleSave = async () => {
        if (!account) return;
        setIsSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/me/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...toProfilePayload(profile, account.role), name }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || '저장에 실패했습니다.');
            // 헤더는 대시보드에서 다시 받아 가므로, 여기서는 이 화면의 표시만 맞춘다.
            setAccount((prev) => (prev ? { ...prev, name: data?.name ?? prev.name } : prev));
            setMessage({ type: 'success', text: '저장했습니다.' });
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : '저장에 실패했습니다.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative">
            <div className="bg-orb w-[420px] h-[420px] bg-primary-600/40 top-[-180px] left-[8%] opacity-10" />

            <header className="relative z-10 glass border-b border-white/[0.06] rounded-none sticky top-0">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
                    <Link href="/dashboard" className="btn-ghost text-sm flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        대시보드
                    </Link>
                    <div className="w-px h-6 bg-white/10" />
                    <h1 className="text-xl font-display font-bold text-white">사용자 정보</h1>
                </div>
            </header>

            <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 page-enter space-y-6">
                {loading ? (
                    <p className="text-sm text-gray-500 py-16 text-center">불러오는 중...</p>
                ) : !account ? (
                    <div className="card text-center py-16">
                        <p className="text-sm text-gray-500">{message?.text ?? '회원 정보를 불러오지 못했습니다.'}</p>
                    </div>
                ) : (
                    <>
                        {/* ── 기본 정보 ───────────────────────────────── */}
                        <section className="card">
                            <h2 className="text-sm font-bold text-white mb-4">기본 정보</h2>

                            <label className="block text-sm font-medium text-gray-400 mb-4">
                                이름
                                <input
                                    className="input mt-2"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="홍길동"
                                    id="profile-name"
                                />
                            </label>

                            <dl className="space-y-2.5 text-sm">
                                <div className="flex gap-4">
                                    <dt className="w-20 flex-shrink-0 text-gray-500">ID</dt>
                                    <dd className="text-white">{account.email}</dd>
                                </div>
                                <div className="flex gap-4">
                                    <dt className="w-20 flex-shrink-0 text-gray-500">역할</dt>
                                    <dd><span className="badge-primary text-[10px]">{MEMBER_ROLE_LABELS[account.role]}</span></dd>
                                </div>
                            </dl>
                            <p className="mt-4 text-[11px] text-gray-600">
                                ID 와 역할은 바꿀 수 없습니다. 변경이 필요하면 관리자에게 문의하세요.
                            </p>
                        </section>

                        {/* ── 소속 정보 (역할별) ──────────────────────── */}
                        {affiliation && account.role === 'MENTEE' && (
                            <section className="card space-y-4">
                                <h2 className="text-sm font-bold text-white">내 소속</h2>

                                <div>
                                    <p className="text-[11px] text-gray-500 mb-1.5">참여 프로그램</p>
                                    {affiliation.program ? (
                                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                                            <p className="text-sm text-white">{affiliation.program.name}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">{affiliation.program.organization}</p>
                                            <p className="text-[11px] text-gray-600 mt-1">{period(affiliation.program)}</p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-amber-400">
                                            아직 어느 프로그램에도 속해 있지 않습니다. 프로그램 매니저에게 배정을 요청하세요.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <p className="text-[11px] text-gray-500 mb-1.5">담당 멘토</p>
                                    {affiliation.mentors.length === 0 ? (
                                        <p className="text-xs text-gray-500">아직 배정된 멘토가 없습니다.</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {affiliation.mentors.map((m) => (
                                                <li key={m.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                                                    <p className="text-sm text-white">{m.name ?? '이름 없음'}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">{m.email}</p>
                                                    <p className="text-[11px] text-gray-600 mt-1">
                                                        담당 프로젝트: {m.projectNames.join(', ')}
                                                    </p>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </section>
                        )}

                        {affiliation && (account.role === 'MENTOR' || account.role === 'PROGRAM_MANAGER') && (
                            <section className="card space-y-3">
                                <h2 className="text-sm font-bold text-white">
                                    {account.role === 'MENTOR' ? '참여 중인 프로그램' : '담당 프로그램'}
                                    <span className="ml-2 text-xs font-normal text-gray-500">
                                        {affiliation.programs.length}개
                                    </span>
                                </h2>

                                {affiliation.programs.length === 0 ? (
                                    <p className="text-xs text-gray-500">
                                        {account.role === 'MENTOR'
                                            ? '아직 배정된 프로젝트가 없습니다.'
                                            : '아직 개설한 프로그램이 없습니다.'}
                                    </p>
                                ) : (
                                    <div className="space-y-3">
                                        {affiliation.programs.map((p) => (
                                            <div key={p.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                                                <p className="text-sm text-white">{p.name}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">{p.organization}</p>
                                                <p className="text-[11px] text-gray-600 mt-1">{period(p)}</p>

                                                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                                                    <p className="text-[11px] text-gray-500 mb-1.5">
                                                        {account.role === 'MENTOR' ? '담당 프로젝트' : '프로젝트'} {p.projects.length}개
                                                    </p>
                                                    {p.projects.length === 0 ? (
                                                        <p className="text-xs text-gray-600">아직 프로젝트가 없습니다.</p>
                                                    ) : (
                                                        <ul className="space-y-1">
                                                            {p.projects.map((proj) => (
                                                                <li key={proj.id} className="text-xs text-gray-300">
                                                                    · {proj.name}
                                                                    {proj.ownerName && (
                                                                        <span className="text-gray-600"> (소유: {proj.ownerName})</span>
                                                                    )}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}

                        {/* ── 회원 정보 수정 ──────────────────────────── */}
                        <section className="card">
                            <h2 className="text-sm font-bold text-white mb-4">회원 정보 수정</h2>
                            <ProfileFields role={account.role} value={profile} onChange={setProfile} />

                            {message && (
                                <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${message.type === 'success'
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                                    }`}>
                                    {message.text}
                                </div>
                            )}

                            <div className="flex justify-end mt-5">
                                <button type="button" onClick={handleSave} disabled={isSaving}
                                    className="btn-primary text-sm disabled:opacity-50" id="profile-save">
                                    {isSaving ? '저장 중...' : '저장'}
                                </button>
                            </div>
                        </section>
                    </>
                )}
            </main>
        </div>
    );
}
