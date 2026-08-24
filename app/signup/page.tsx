'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProfileFields, { EMPTY_PROFILE, toProfilePayload, type ProfileValue } from '@/components/member/ProfileFields';
import type { MemberRole } from '@/lib/member-roles';

export default function SignupPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
    });
    const [inviteCode, setInviteCode] = useState('');
    const [profile, setProfile] = useState<ProfileValue>(EMPTY_PROFILE);
    // 가입자가 멘토·멘티 중 하나를 직접 고른다. 기본값은 멘티다. 초대 코드가
    // 있으면 서버가 코드의 역할로 덮어쓰므로, 여기 선택은 코드가 없을 때만
    // 실제 계정 역할로 반영된다.
    const [assumedRole, setAssumedRole] = useState<MemberRole>('MENTEE');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [focusedField, setFocusedField] = useState<string | null>(null);

    const passwordStrength = (pw: string): { level: number; label: string; color: string } => {
        if (pw.length === 0) return { level: 0, label: '', color: '' };
        if (pw.length < 6) return { level: 1, label: '약함', color: 'bg-rose-500' };
        if (pw.length < 8) return { level: 2, label: '보통', color: 'bg-amber-500' };
        if (pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw)) return { level: 4, label: '강함', color: 'bg-emerald-500' };
        return { level: 3, label: '양호', color: 'bg-primary-500' };
    };

    const strength = passwordStrength(formData.password);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('비밀번호가 일치하지 않습니다.');
            return;
        }

        if (formData.password.length < 8) {
            setError('비밀번호는 최소 8자 이상이어야 합니다.');
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    password: formData.password,
                    ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
                    role: assumedRole,
                    profile: toProfilePayload(profile, assumedRole),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '회원가입에 실패했습니다.');
            }

            // 가입 직후에는 승인 대기 상태라 바로 로그인할 수 없다. 로그인 화면에서 안내한다.
            router.push('/login?signup=pending');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const fields: { id: string; label: string; type: string; placeholder: string; key: keyof typeof formData; icon: React.ReactNode }[] = [
        {
            id: 'name', label: '이름', type: 'text', placeholder: '홍길동', key: 'name',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
        },
        {
            id: 'email', label: 'ID', type: 'email', placeholder: 'your@email.com', key: 'email',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
        },
        {
            id: 'password', label: '비밀번호', type: 'password', placeholder: '최소 8자', key: 'password',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
        },
        {
            id: 'confirmPassword', label: '비밀번호 확인', type: 'password', placeholder: '비밀번호 재입력', key: 'confirmPassword',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
        },
    ];

    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative overflow-hidden flex items-center justify-center px-4 py-12">
            {/* Background Orbs */}
            <div className="bg-orb w-[500px] h-[500px] bg-accent-500 top-[-100px] left-[-100px] animate-pulse-slow" />
            <div className="bg-orb w-[400px] h-[400px] bg-primary-600 bottom-[-100px] right-[-100px] animate-pulse-slow" style={{ animationDelay: '2s' }} />

            <div className="relative z-10 w-full max-w-md space-y-8 animate-fade-in">
                {/* Logo & Title */}
                <div className="text-center">
                    <Link href="/" className="inline-flex items-center gap-2 mb-6 group">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold group-hover:scale-105 transition-transform">
                            K
                        </div>
                        <span className="text-xl font-display font-bold text-white">KS-QFD</span>
                    </Link>
                    <h1 className="text-3xl font-display font-bold text-white mb-2">
                        계정 만들기
                    </h1>
                    <p className="text-gray-400">무료로 시작하고 팀과 함께 성장하세요</p>
                </div>

                {/* Signup Form */}
                <div className="glass-strong p-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
                    {error && (
                        <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 px-4 py-3 rounded-xl mb-6 animate-slide-down text-sm">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {fields.map((field) => (
                            <div key={field.id}>
                                <label
                                    htmlFor={field.id}
                                    className={`block text-sm font-medium mb-2 transition-colors duration-200 ${focusedField === field.id ? 'text-primary-400' : 'text-gray-400'}`}
                                >
                                    {field.label}
                                </label>
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                                        {field.icon}
                                    </div>
                                    <input
                                        id={field.id}
                                        type={field.type}
                                        required
                                        value={formData[field.key]}
                                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                                        onFocus={() => setFocusedField(field.id)}
                                        onBlur={() => setFocusedField(null)}
                                        className="input pl-12"
                                        placeholder={field.placeholder}
                                    />
                                </div>

                                {/* Password Strength Indicator */}
                                {field.id === 'password' && formData.password.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                        <div className="flex gap-1">
                                            {[1, 2, 3, 4].map((i) => (
                                                <div
                                                    key={i}
                                                    className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength.level ? strength.color : 'bg-white/10'
                                                        }`}
                                                />
                                            ))}
                                        </div>
                                        <p className={`text-xs ${strength.level <= 1 ? 'text-rose-400' : strength.level <= 2 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                            {strength.label}
                                        </p>
                                    </div>
                                )}

                                {/* Password Match Indicator */}
                                {field.id === 'confirmPassword' && formData.confirmPassword.length > 0 && (
                                    <p className={`text-xs mt-2 ${formData.password === formData.confirmPassword ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {formData.password === formData.confirmPassword ? '✓ 비밀번호가 일치합니다' : '✕ 비밀번호가 일치하지 않습니다'}
                                    </p>
                                )}
                            </div>
                        ))}

                        <div>
                            <label
                                htmlFor="inviteCode"
                                className="block text-sm font-medium mb-2 text-gray-400"
                            >
                                초대 코드
                            </label>
                            <input
                                id="inviteCode"
                                type="text"
                                value={inviteCode}
                                onChange={(e) => setInviteCode(e.target.value)}
                                className="input"
                                placeholder="초대 코드(선택)"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                초대 코드가 있으면 입력하세요. 없으면 관리자 승인 후 이용할 수 있습니다.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2 text-gray-400">
                                가입할 역할
                                <select
                                    className="input mt-2"
                                    value={assumedRole}
                                    onChange={(e) => setAssumedRole(e.target.value as MemberRole)}
                                >
                                    <option value="MENTEE">멘티</option>
                                    <option value="MENTOR">멘토</option>
                                </select>
                            </label>
                            <p className="mt-2 text-xs text-gray-500">
                                초대 코드가 있으면 코드에 정해진 역할이 우선 적용됩니다.
                            </p>
                        </div>

                        <ProfileFields role={assumedRole} value={profile} onChange={setProfile} />

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full btn-primary py-3.5 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                    가입 중...
                                </span>
                            ) : '회원가입'}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-gray-500 text-sm">
                            이미 계정이 있으신가요?{' '}
                            <Link href="/login" className="text-primary-400 hover:text-primary-300 font-semibold transition-colors">
                                로그인
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
