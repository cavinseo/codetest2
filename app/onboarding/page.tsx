'use client';
// 첫 로그인 관문. 프로필 작성을 이 화면에서 끝낸다.
// 임시 비밀번호 변경은 여기 포함되지 않으며 이후 작업으로 미뤄져 있다.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProfileFields, { EMPTY_PROFILE, toProfilePayload, type ProfileValue } from '@/components/member/ProfileFields';
import type { MemberRole } from '@/lib/member-roles';

export default function OnboardingPage() {
    const router = useRouter();
    const [role, setRole] = useState<MemberRole>('MENTEE');
    const [needsProfile, setNeedsProfile] = useState(false);
    const [profile, setProfile] = useState<ProfileValue>(EMPTY_PROFILE);
    const [message, setMessage] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetch('/api/me/profile')
            .then((res) => res.json())
            .then((data) => {
                setRole(data.role);
                setNeedsProfile(data.needsProfile);
                if (!data.needsProfile) router.replace('/dashboard');
            })
            .catch(() => setMessage('프로필 정보를 불러오지 못했습니다.'));
    }, [router]);

    const handleSave = async () => {
        setIsSaving(true);
        setMessage('');
        try {
            const res = await fetch('/api/me/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(toProfilePayload(profile, role)),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || '저장에 실패했습니다.');
            router.replace('/dashboard');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '저장에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!needsProfile) return null;

    return (
        <main className="mx-auto max-w-lg p-6">
            <h1 className="mb-2 text-xl font-bold">회원 정보를 입력해 주세요.</h1>
            <p className="mb-6 text-sm text-gray-500">
                프로그램 운영에 필요한 정보입니다. 입력해야 다음으로 넘어갈 수 있습니다.
            </p>

            <ProfileFields role={role} value={profile} onChange={setProfile} />

            {message && <p className="mt-4 text-sm text-red-600">{message}</p>}

            <button type="button" onClick={handleSave} disabled={isSaving}
                className="mt-6 w-full rounded-lg bg-indigo-600 py-2 text-white disabled:opacity-50">
                {isSaving ? '저장 중…' : '저장하고 시작하기'}
            </button>
        </main>
    );
}
