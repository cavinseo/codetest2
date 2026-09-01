'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { readSignupEmail } from '@/lib/signup-prefill';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [focusedField, setFocusedField] = useState<string | null>(null);
    // Google 로그인에서 "가입된 회원이 없음"으로 튕긴 경우, 그 이메일로 가입을 권한다.
    const [signupEmail, setSignupEmail] = useState<string | null>(null);

    // 가입 직후 리다이렉트로 들어온 경우 승인 대기 안내를 보여준다.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
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

        // 가입을 권할 수 있는 것은 계정이 아예 없을 때뿐이다. 승인 대기·기한 만료는
        // 이미 계정이 있는 경우라 콜백이 쿠키를 남기지 않는다.
        if (googleLoginError === 'no_account') {
            setSignupEmail(readSignupEmail(document.cookie));
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '로그인에 실패했습니다.');
            }

            // 임시 비밀번호를 바꿔야 하거나 프로필이 미완성이면 온보딩에서 마무리한다.
            router.push(data.mustChangePassword || data.needsProfile ? '/onboarding' : '/dashboard');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative overflow-hidden flex items-center justify-center px-4">
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
                <div className="glass-strong p-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
                    {notice && (
                        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-4 py-3 rounded-xl mb-6 animate-slide-down text-sm">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span>{notice}</span>
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 px-4 py-3 rounded-xl mb-6 animate-slide-down text-sm">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="email" className={`block text-sm font-medium mb-2 transition-colors duration-200 ${focusedField === 'email' ? 'text-primary-400' : 'text-gray-400'}`}>
                                ID
                            </label>
                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                </div>
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onFocus={() => setFocusedField('email')}
                                    onBlur={() => setFocusedField(null)}
                                    className="input pl-12"
                                    placeholder="your@email.com"
                                />
                            </div>
                        </div>

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
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onFocus={() => setFocusedField('password')}
                                    onBlur={() => setFocusedField(null)}
                                    className="input pl-12"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

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
                            ) : '로그인'}
                        </button>
                    </form>

                    <div className="flex items-center gap-4 my-6">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-xs text-gray-500">또는</span>
                        <div className="h-px flex-1 bg-white/10" />
                    </div>

                    <a
                        href="/api/auth/google/login"
                        className="w-full btn-secondary py-3.5 text-base font-semibold flex items-center justify-center"
                    >
                        Google 계정으로 로그인
                    </a>

                    {signupEmail && (
                        <div className="mt-6 rounded-lg border border-primary-500/25 bg-primary-500/[0.06] p-4 animate-fade-in">
                            <p className="text-sm text-gray-300">
                                <span className="font-semibold text-white">{signupEmail}</span>
                                {' '}로 가입된 회원이 없습니다.
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                가입 후 관리자 승인을 받아야 로그인할 수 있습니다.
                            </p>
                            <Link
                                href="/signup"
                                className="mt-3 w-full btn-primary py-2.5 text-sm font-semibold flex items-center justify-center"
                            >
                                이 계정으로 회원가입
                            </Link>
                        </div>
                    )}

                    <div className="mt-6 text-center">
                        <p className="text-gray-500 text-sm">
                            계정이 없으신가요?{' '}
                            <Link href="/signup" className="text-primary-400 hover:text-primary-300 font-semibold transition-colors">
                                회원가입
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-gray-600 animate-fade-in" style={{ animationDelay: '0.3s' }}>
                    로그인 시 서비스 이용약관 및 개인정보 처리방침에 동의합니다
                </p>
            </div>
        </div>
    );
}
