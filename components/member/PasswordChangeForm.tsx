'use client';
// 본인 확인 수단을 선택해 회원 비밀번호를 독립적으로 설정·변경하는 폼.
import { useEffect, useId, useRef, useState } from 'react';
import { PASSWORD_MIN_LENGTH, getNewPasswordError, getPasswordChangeError } from '@/lib/password-policy';

interface Props {
    canVerifyPasswordWithInviteCode: boolean;
    onChanged?: () => void;
}

const EMPTY_FORM = { currentPassword: '', inviteCode: '', newPassword: '', confirmPassword: '' };

export default function PasswordChangeForm({ canVerifyPasswordWithInviteCode, onChanged }: Props) {
    const [verificationMethod, setVerificationMethod] = useState<'password' | 'invite'>(canVerifyPasswordWithInviteCode ? 'invite' : 'password');
    const [form, setForm] = useState(EMPTY_FORM);
    const [isSaving, setIsSaving] = useState(false);
    const saving = useRef(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const id = useId();
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (saving.current) return;
        setMessage(null);
        const error = verificationMethod === 'invite'
            ? (!form.inviteCode.trim() ? '초대 코드를 입력하세요.' : getNewPasswordError(form))
            : getPasswordChangeError(form);
        if (error) {
            setMessage({ type: 'error', text: error });
            return;
        }

        saving.current = true;
        setIsSaving(true);
        try {
            const response = await fetch('/api/admin/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    verificationMethod,
                    ...(verificationMethod === 'invite' ? { inviteCode: form.inviteCode } : { currentPassword: form.currentPassword }),
                    newPassword: form.newPassword,
                    confirmPassword: form.confirmPassword,
                }),
            });
            const data = await response.json().catch(() => null);
            if (!mounted.current) return;
            if (!response.ok) throw new Error(data?.error || '비밀번호 변경에 실패했습니다.');
            setForm(EMPTY_FORM);
            setMessage({ type: 'success', text: data?.message || '비밀번호를 변경했습니다. 다른 기기의 로그인은 해제됩니다.' });
            onChanged?.();
        } catch (error) {
            if (mounted.current) setMessage({ type: 'error', text: error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다.' });
        } finally {
            saving.current = false;
            if (mounted.current) setIsSaving(false);
        }
    };

    const fields = [
        ...(verificationMethod === 'invite'
            ? [{ key: 'inviteCode', label: '초대 코드', autoComplete: 'off' } as const]
            : [{ key: 'currentPassword', label: '현재 비밀번호', autoComplete: 'current-password' } as const]),
        { key: 'newPassword', label: '새 비밀번호', autoComplete: 'new-password' } as const,
        { key: 'confirmPassword', label: '새 비밀번호 확인', autoComplete: 'new-password' } as const,
    ];

    return (
        <section className="card" aria-labelledby={`${id}-title`}>
            <h2 id={`${id}-title`} className="text-sm font-bold text-white mb-4">비밀번호 설정·변경</h2>
            <p className="text-sm text-gray-400 mb-4">
                본인 확인 후 새 비밀번호를 저장합니다. 변경하면 다른 기기의 로그인은 해제됩니다.
            </p>
            {canVerifyPasswordWithInviteCode && (
                <p className="text-xs text-gray-400 mb-4">
                    초대 코드는 이용 기간 동안 로그인과 비밀번호 재설정에 계속 사용할 수 있습니다.
                </p>
            )}
            <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-busy={isSaving}>
                {canVerifyPasswordWithInviteCode && (
                    <fieldset>
                        <legend className="text-sm font-medium text-gray-400 mb-2">본인 확인 방식</legend>
                        <div className="flex flex-wrap gap-4">
                            {([
                                { value: 'invite', label: '초대 코드로 확인' },
                                { value: 'password', label: '현재 비밀번호로 확인' },
                            ] as const).map((method) => (
                                <label key={method.value} className="flex items-center gap-2 text-sm text-gray-300">
                                    <input type="radio" name="verificationMethod" value={method.value}
                                        checked={verificationMethod === method.value} disabled={isSaving}
                                        onChange={() => { setVerificationMethod(method.value); setMessage(null); }} />
                                    {method.label}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                )}
                {fields.map((field) => (
                    <label key={field.key} className="block text-sm font-medium text-gray-400">
                        {field.label}
                        <input type="password" name={field.key} className="input mt-2" required
                            autoComplete={field.autoComplete} value={form[field.key]} disabled={isSaving}
                            aria-describedby={`${id}-policy`}
                            onChange={(event) => setForm((previous) => ({ ...previous, [field.key]: event.target.value }))} />
                    </label>
                ))}
                <p id={`${id}-policy`} className="text-xs text-gray-500">
                    새 비밀번호는 최소 {PASSWORD_MIN_LENGTH}자 이상이어야 합니다.
                </p>
                {message && (
                    <div role={message.type === 'error' ? 'alert' : 'status'}
                        className={`rounded-lg border px-4 py-3 text-sm ${message.type === 'success'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                            : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
                        {message.text}
                    </div>
                )}
                <div className="flex justify-end">
                    <button type="submit" disabled={isSaving} className="btn-primary text-sm disabled:opacity-50">
                        {isSaving ? '변경 중...' : '비밀번호 저장'}
                    </button>
                </div>
            </form>
        </section>
    );
}
