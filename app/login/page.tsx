'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';

export default function LoginPage() {
    const router = useRouter();
    const [role, setRole] = useState<'PROGRAM_MANAGER' | 'MENTOR' | 'MENTEE'>('MENTOR');
    const [mode, setMode] = useState<'password' | 'invite'>('password');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [focusedField, setFocusedField] = useState<string | null>(null);
    const submittingRef = useRef(false);
    const mountedRef = useRef(false);
    const isInviteLogin = role === 'MENTEE' && mode === 'invite';

    // 가입 직후 리다이렉트로 들어온 경우 승인 대기 안내를 보여준다.
    useEffect(() => {
        mountedRef.current = true;
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'invite') {
            setRole('MENTEE');
            setMode('invite');
        }
        if (params.get('signup') === 'pending') {
            setNotice('가입이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.');
        }

        const googleLoginErrors: Record<string, string> = {
            google_unconfigured: 'Google 로그인이 아직 설정되지 않았습니다. 관리자에게 문의하세요.',
            google_denied: 'Google 로그인을 취소했습니다.',
            google_state: '로그인 시도가 만료되었습니다. 다시 시도하세요.',
            google_unverified: '확인되지 않은 Google 이메일입니다.',
            no_account: '이 Google 계정으로 가입된 회원이 없습니다. 먼저 회원가입을 해주세요.',
            pending: '가입 승인 대기 중입니다. 관리자 승인 후 이용할 수 있습니다.',
            expired: '이용 기간이 만료되었습니다. 관리자에게 연장을 요청하세요.',
            google_failed: 'Google 로그인에 실패했습니다. 다시 시도하세요.',
        };
        const googleLoginError = params.get('error');
        if (googleLoginError && googleLoginErrors[googleLoginError]) {
            setError(googleLoginErrors[googleLoginError]);
        }
        return () => { mountedRef.current = false; };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submittingRef.current) return;
        submittingRef.current = true;
        setError('');
        setIsLoading(true);

        try {
            const response = await fetch(isInviteLogin ? '/api/auth/invite-login' : '/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isInviteLogin ? { email, inviteCode } : { email, password }),
            });

            const data = await response.json();
            if (!mountedRef.current) return;

            if (!response.ok) {
                throw new Error(data.error || '로그인에 실패했습니다.');
            }

            // 임시 비밀번호를 바꿔야 하거나 프로필이 미완성이면 온보딩에서 마무리한다.
            router.push(data.mustChangePassword || data.needsProfile ? '/onboarding' : '/dashboard');
        } catch (err: any) {
            if (mountedRef.current) setError(err.message);
        } finally {
            submittingRef.current = false;
            if (mountedRef.current) setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative overflow-hidden flex items-center justify-center px-4 py-12">
            {/* 헤더가 없는 화면이라 가릴 내용이 없다 — 오른쪽 위 모서리에 그대로 띄운다. */}
            <ThemeToggle className="fixed right-4 top-4 z-50" />
            {/* Background Orbs */}
            <div className="bg-orb w-[500px] h-[500px] bg-primary-600 top-[-100px] right-[-100px] animate-pulse-slow" />
            <div className="bg-orb w-[400px] h-[400px] bg-accent-500 bottom-[-100px] left-[-100px] animate-pulse-slow" style={{ animationDelay: '2s' }} />

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
                        다시 오신 것을 환영합니다
                    </h1>
                    <p className="text-gray-400">계정에 로그인하여 프로젝트를 관리하세요</p>
                </div>

                {/* Login Form */}
                <div className="glass-strong p-6 sm:p-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
                    <div role="group" aria-label="로그인 역할 선택" className="grid grid-cols-3 gap-2 mb-5">
                        {([
                            ['PROGRAM_MANAGER', '프로그램 매니저'],
                            ['MENTOR', '멘토'],
                            ['MENTEE', '멘티'],
                        ] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={role === value}
                                disabled={isLoading}
                                onClick={() => {
                                    if (submittingRef.current) return;
                                    setRole(value);
                                    setMode(value === 'MENTEE' ? 'invite' : 'password');
                                    setError('');
                                    setFocusedField(null);
                                }}
                                className={`min-w-0 rounded-xl px-2 py-3 text-sm font-semibold break-keep transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${role === value ? 'bg-primary-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {role === 'MENTEE' && (
                        <div role="group" aria-label="멘티 로그인 방식" className="flex gap-2 mb-4">
                            {([
                                ['invite', '초대 코드 로그인'],
                                ['password', '비밀번호 로그인'],
                            ] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={mode === value}
                                    disabled={isLoading}
                                    onClick={() => {
                                        if (submittingRef.current) return;
                                        setMode(value);
                                        setError('');
                                        setFocusedField(null);
                                    }}
                                    className={`flex-1 min-w-0 rounded-lg px-2 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${mode === value ? 'bg-primary-500/15 text-primary-400 font-semibold' : 'text-gray-400 hover:bg-white/5'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}

                    <p className="text-sm text-gray-400 mb-6">
                        {isInviteLogin
                            ? '초대받은 이메일과 코드를 입력해 주세요. 처음 로그인하면 계정이 생성되며, 이후에도 같은 코드로 로그인할 수 있습니다.'
                            : role === 'MENTEE'
                                ? '기존 계정의 ID와 비밀번호 또는 Google 계정으로 로그인해 주세요.'
                                : `${role === 'PROGRAM_MANAGER' ? '프로그램 매니저' : '멘토'} 계정의 ID와 비밀번호 또는 Google 계정으로 로그인해 주세요.`}
                    </p>
                    {notice && (
                        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-4 py-3 rounded-xl mb-6 animate-slide-down text-sm">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span>{notice}</span>
                        </div>
                    )}
                    {error && (
                        <div role="alert" className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 px-4 py-3 rounded-xl mb-6 animate-slide-down text-sm">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="email" className={`block text-sm font-medium mb-2 transition-colors duration-200 ${focusedField === 'email' ? 'text-primary-400' : 'text-gray-400'}`}>
                                {isInviteLogin ? '이메일' : 'ID'}
                            </label>
                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                </div>
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    disabled={isLoading}
                                    autoComplete="username"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onFocus={() => setFocusedField('email')}
                                    onBlur={() => setFocusedField(null)}
                                    className="input pl-12"
                                    placeholder="your@email.com"
                                />
                            </div>
                        </div>

                        {isInviteLogin ? (
                            <div>
                                <label htmlFor="inviteCode" className={`block text-sm font-medium mb-2 transition-colors duration-200 ${focusedField === 'inviteCode' ? 'text-primary-400' : 'text-gray-400'}`}>
                                    초대 코드
                                </label>
                                <input
                                    id="inviteCode"
                                    type="text"
                                    required
                                    disabled={isLoading}
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                    spellCheck={false}
                                    maxLength={100}
                                    value={inviteCode}
                                    onChange={(e) => setInviteCode(e.target.value)}
                                    onFocus={() => setFocusedField('inviteCode')}
                                    onBlur={() => setFocusedField(null)}
                                    className="input font-mono"
                                    placeholder="메일로 받은 초대 코드"
                                />
                            </div>
                        ) : (
                        <div>
                            <label htmlFor="password" className={`block text-sm font-medium mb-2 transition-colors duration-200 ${focusedField === 'password' ? 'text-primary-400' : 'text-gray-400'}`}>
                                비밀번호
                            </label>
                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                </div>
                                <input
                                    id="password"
                                    type="password"
                                    required
                                    disabled={isLoading}
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onFocus={() => setFocusedField('password')}
                                    onBlur={() => setFocusedField(null)}
                                    className="input pl-12"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full btn-primary py-3.5 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                    로그인 중...
                                </span>
                            ) : isInviteLogin ? '초대 코드로 로그인' : '로그인'}
                        </button>
                    </form>

                    {!isInviteLogin && <>
                    <div className="flex items-center gap-4 my-6">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-xs text-gray-500">또는</span>
                        <div className="h-px flex-1 bg-white/10" />
                    </div>

                    <a
                        href="/api/auth/google/login"
                        aria-disabled={isLoading}
                        onClick={(event) => { if (submittingRef.current) event.preventDefault(); }}
                        className="w-full btn-secondary py-3.5 text-base font-semibold flex items-center justify-center"
                    >
                        Google 계정으로 로그인
                    </a>

                    <div className="mt-6 text-center">
                        <p className="text-gray-500 text-sm">
                            계정이 없으신가요?{' '}
                            <Link href="/signup" onClick={(event) => { if (submittingRef.current) event.preventDefault(); }} className="text-primary-400 hover:text-primary-300 font-semibold transition-colors">
                                회원가입
                            </Link>
                        </p>
                    </div>
                    </>}
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-gray-600 animate-fade-in" style={{ animationDelay: '0.3s' }}>
                    로그인 시 서비스 이용약관 및 개인정보 처리방침에 동의합니다
                </p>
            </div>
        </div>
    );
}
