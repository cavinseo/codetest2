'use client';
// 첫 로그인 관문. 임시 비밀번호 변경과 프로필 작성을 이 화면에서 끝낸다.
// 필요한 단계만 보여주고, 둘 다 끝나면 대시보드로 보낸다.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProfileFields, { EMPTY_PROFILE, toProfilePayload, type ProfileValue } from '@/components/member/ProfileFields';
import PasswordChangeForm from '@/components/member/PasswordChangeForm';
import { fromProfileRecord } from '@/lib/member-profile-payload';
import type { MemberRole } from '@/lib/member-roles';
import ThemeToggle from '@/components/ThemeToggle';

export default function OnboardingPage() {
    const router = useRouter();
    const [role, setRole] = useState<MemberRole>('MENTEE');
    const [needsProfile, setNeedsProfile] = useState(false);
    const [mustChangePassword, setMustChangePassword] = useState(false);
    const [ready, setReady] = useState(false);
    const [profile, setProfile] = useState<ProfileValue>(EMPTY_PROFILE);
    const [message, setMessage] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [canVerifyPasswordWithInviteCode, setCanVerifyPasswordWithInviteCode] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [loadAttempt, setLoadAttempt] = useState(0);
    const mounted = useRef(false);
    const savingProfile = useRef(false);

    useEffect(() => {
        let cancelled = false;
        mounted.current = true;
        setLoadError('');
        fetch('/api/me/profile')
            .then(async (res) => {
                const data = await res.json().catch(() => null);
                if (!res.ok || !data) throw new Error(data?.error || '회원 정보를 불러오지 못했습니다.');
                return data;
            })
            .then((data) => {
                if (cancelled) return;
                setRole(data.role);
                setNeedsProfile(data.needsProfile);
                setMustChangePassword(data.mustChangePassword);
                setCanVerifyPasswordWithInviteCode(data.canVerifyPasswordWithInviteCode === true);
                setProfile(fromProfileRecord(data.profile));
                setReady(true);
            })
            .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : '회원 정보를 불러오지 못했습니다.'); });
        return () => { cancelled = true; mounted.current = false; };
    }, [loadAttempt]);

    useEffect(() => {
        if (ready && !needsProfile && !mustChangePassword) router.replace('/dashboard');
    }, [ready, needsProfile, mustChangePassword, router]);

    const handleSave = async () => {
        if (savingProfile.current) return;
        savingProfile.current = true;
        setIsSaving(true);
        setMessage('');
        try {
            const res = await fetch('/api/me/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(toProfilePayload(profile, role)),
            });
            const data = await res.json().catch(() => null);
            if (!mounted.current) return;
            if (!res.ok) throw new Error(data?.error || '저장에 실패했습니다.');
            setNeedsProfile(false);
        } catch (error) {
            if (mounted.current) setMessage(error instanceof Error ? error.message : '저장에 실패했습니다.');
        } finally {
            savingProfile.current = false;
            if (mounted.current) setIsSaving(false);
        }
    };

    if (!ready) return <main className="mx-auto max-w-lg p-6">
        {loadError ? <>
            <p role="alert" className="text-sm text-rose-400">{loadError}</p>
            <button type="button" className="btn-secondary mt-4" onClick={() => setLoadAttempt((previous) => previous + 1)}>회원 정보 다시 불러오기</button>
        </> : <p role="status" className="text-sm text-gray-500">회원 정보를 불러오는 중입니다.</p>}
    </main>;

    return (
        <main className="mx-auto max-w-lg p-6">
            {/* 헤더가 없는 화면이라 가릴 내용이 없다 — 오른쪽 위 모서리에 그대로 띄운다. */}
            <ThemeToggle className="fixed right-4 top-4 z-50" />
            <h1 className="mb-2 text-xl font-bold">계정 설정을 마무리해 주세요.</h1>
            <p className="mb-6 text-sm text-gray-500">
                프로그램을 시작하기 전에 아래 항목을 완료해야 합니다.
            </p>

            {mustChangePassword && (
                <section className="mb-8">
                    <h2 className="mb-2 text-lg font-semibold">비밀번호 변경</h2>
                    <p className="mb-4 text-sm text-gray-500">
                        {canVerifyPasswordWithInviteCode
                            ? '초대 코드로 본인을 확인하고 새 비밀번호를 설정해 주세요. 기존 비밀번호는 필요하지 않습니다.'
                            : '메일로 받은 임시 비밀번호를 현재 비밀번호 칸에 입력하고 새 비밀번호로 바꿔 주세요.'}
                    </p>
                    <PasswordChangeForm canVerifyPasswordWithInviteCode={canVerifyPasswordWithInviteCode}
                        onChanged={() => setMustChangePassword(false)} />
                </section>
            )}

            {needsProfile && (
                <section>
                    <h2 className="mb-2 text-lg font-semibold">회원 정보</h2>
                    <p className="mb-4 text-sm text-gray-500">
                        프로그램 운영에 필요한 정보입니다. 입력해야 다음으로 넘어갈 수 있습니다.
                    </p>

                    <ProfileFields role={role} value={profile} onChange={setProfile} />

                    {message && <p className="mt-4 text-sm text-red-600">{message}</p>}

                    <button type="button" onClick={handleSave} disabled={isSaving}
                        className="mt-6 w-full rounded-lg bg-indigo-600 py-2 text-white disabled:opacity-50">
                        {isSaving ? '저장 중…' : '저장하고 시작하기'}
                    </button>
                </section>
            )}
        </main>
    );
}
