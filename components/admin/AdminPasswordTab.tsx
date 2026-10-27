'use client';
// 관리자 화면의 비밀번호 변경 탭. 지금 로그인한 계정의 비밀번호만 바꾼다.
//
// 관리자 화면(app/admin/page.tsx)이 이 탭의 입력·결과·처리 중 상태를 함께 들고 있었다
// (2026-10-25 코드 리뷰 L4). 다른 탭과 나누는 상태가 없어 그대로 떼어 냈다.
import { useState } from 'react';
import { PASSWORD_MIN_LENGTH, getPasswordChangeError } from '@/lib/password-policy';

export default function AdminPasswordTab() {
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [isChangingPassword, setIsChangingPassword] = useState(false);

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
    return (
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
    );
}
