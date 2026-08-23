'use client';
// 첫 로그인 관문. 임시 비밀번호 변경과 프로필 작성을 이 화면에서 끝낸다.
// 필요한 단계만 보여주고, 둘 다 끝나면 대시보드로 보낸다.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProfileFields, { EMPTY_PROFILE, toProfilePayload, type ProfileValue } from '@/components/member/ProfileFields';
import { PASSWORD_MIN_LENGTH, getPasswordChangeError } from '@/lib/password-policy';
import type { MemberRole } from '@/lib/member-roles';

const EMPTY_PASSWORD_FORM = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function OnboardingPage() {
    const router = useRouter();
    const [role, setRole] = useState<MemberRole>('MENTEE');
    const [needsProfile, setNeedsProfile] = useState(false);
    const [mustChangePassword, setMustChangePassword] = useState(false);
    const [ready, setReady] = useState(false);
    const [profile, setProfile] = useState<ProfileValue>(EMPTY_PROFILE);
    const [message, setMessage] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
    const [passwordMsg, setPasswordMsg] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    useEffect(() => {
        fetch('/api/me/profile')
            .then((res) => res.json())
            .then((data) => {
                setRole(data.role);
                setNeedsProfile(data.needsProfile);
                setMustChangePassword(data.mustChangePassword);
                // 남은 단계가 하나도 없으면 이 화면에 머물 이유가 없다.
                if (!data.needsProfile && !data.mustChangePassword) {
                    router.replace('/dashboard');
                    return;
                }
                setReady(true);
            })
            .catch(() => setMessage('회원 정보를 불러오지 못했습니다.'));
    }, [router]);

    const handleChangePassword = async (event: React.FormEvent) => {
        event.preventDefault();
        setPasswordMsg('');

        // 서버에 보내기 전에 같은 규칙으로 한 번 걸러 왕복을 줄인다.
        const localError = getPasswordChangeError(passwordForm);
        if (localError) {
            setPasswordMsg(localError);
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
            if (!res.ok) throw new Error(data?.error || '비밀번호 변경에 실패했습니다.');
            setPasswordForm(EMPTY_PASSWORD_FORM);
            // 남은 단계(프로필)가 없으면 바로 대시보드로 보낸다.
            if (!needsProfile) {
                router.replace('/dashboard');
                return;
            }
            setMustChangePassword(false);
        } catch (error) {
            setPasswordMsg(error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다.');
        } finally {
            setIsChangingPassword(false);
        }
    };

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
            // 남은 단계(비밀번호)가 없으면 바로 대시보드로 보낸다.
            if (!mustChangePassword) {
                router.replace('/dashboard');
                return;
            }
            setNeedsProfile(false);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '저장에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!ready) return null;

    return (
        <main className="mx-auto max-w-lg p-6">
            <h1 className="mb-2 text-xl font-bold">계정 설정을 마무리해 주세요.</h1>
            <p className="mb-6 text-sm text-gray-500">
                프로그램을 시작하기 전에 아래 항목을 완료해야 합니다.
            </p>

            {mustChangePassword && (
                <section className="mb-8">
                    <h2 className="mb-2 text-lg font-semibold">비밀번호 변경</h2>
                    <p className="mb-4 text-sm text-gray-500">
                        메일로 받은 임시 비밀번호를 새 비밀번호로 바꿔 주세요.
                    </p>

                    <form onSubmit={handleChangePassword} className="space-y-3">
                        {([
                            { key: 'currentPassword', label: '임시 비밀번호', autoComplete: 'current-password' },
                            { key: 'newPassword', label: '새 비밀번호', autoComplete: 'new-password' },
                            { key: 'confirmPassword', label: '새 비밀번호 확인', autoComplete: 'new-password' },
                        ] as const).map((field) => (
                            <label key={field.key} className="block text-sm font-medium text-gray-400">
                                {field.label}
                                <input
                                    type="password"
                                    className="input mt-2"
                                    value={passwordForm[field.key]}
                                    autoComplete={field.autoComplete}
                                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                    disabled={isChangingPassword}
                                />
                            </label>
                        ))}

                        <p className="text-xs text-gray-500">
                            새 비밀번호는 최소 {PASSWORD_MIN_LENGTH}자 이상이어야 합니다.
                        </p>

                        {passwordMsg && <p className="text-sm text-red-600">{passwordMsg}</p>}

                        <button type="submit" disabled={isChangingPassword}
                            className="w-full rounded-lg bg-indigo-600 py-2 text-white disabled:opacity-50">
                            {isChangingPassword ? '변경 중…' : '비밀번호 변경'}
                        </button>
                    </form>
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
