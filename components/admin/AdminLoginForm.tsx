// 관리자 로그인 폼. /admin 과 /admin/login 이 같은 화면을 쓰도록 컴포넌트로 뺐다.
'use client';

import { useState } from 'react';
import Link from 'next/link';

interface AdminLoginFormProps {
    /** 로그인과 권한 확인을 모두 통과했을 때 부른다. */
    onAuthenticated: () => void;
}

export default function AdminLoginForm({ onAuthenticated }: AdminLoginFormProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [focusedField, setFocusedField] = useState<string | null>(null);

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

            // 로그인은 됐어도 관리자 계정이 아니면 관리자 화면으로 보내지 않는다.
            const adminCheck = await fetch('/api/admin/stats');
            if (adminCheck.status === 403) {
                throw new Error('이 계정에는 관리자 권한이 없습니다. 관리자 계정으로 로그인하세요.');
            }
            if (!adminCheck.ok) {
                throw new Error('관리자 권한을 확인하지 못했습니다. 잠시 후 다시 시도하세요.');
            }

            onAuthenticated();
        } catch (err) {
            setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative overflow-hidden flex items-center justify-center px-4">
            <div className="bg-orb w-[500px] h-[500px] bg-amber-500 top-[-100px] right-[-100px] animate-pulse-slow" />
            <div className="bg-orb w-[400px] h-[400px] bg-rose-500 bottom-[-100px] left-[-100px] animate-pulse-slow" style={{ animationDelay: '2s' }} />

            <div className="relative z-10 w-full max-w-md space-y-8 animate-fade-in">
                <div className="text-center">
                    <Link href="/" className="inline-flex items-center gap-2 mb-6 group">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-white font-bold group-hover:scale-105 transition-transform">
                            🛡️
                        </div>
                        <span className="text-xl font-display font-bold text-white">KS-QFD</span>
                    </Link>
                    <h1 className="text-3xl font-display font-bold text-white mb-2">관리자 모드</h1>
                    <p className="text-gray-400">관리자 권한이 있는 계정으로 로그인하세요</p>
                </div>

                <div className="glass-strong p-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
                    <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 text-amber-200 px-4 py-3 rounded-xl mb-6 text-sm">
                        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.667 1.73-2.5L13.73 4c-.77-.833-1.96-.833-2.73 0L3.2 16.5c-.77.833.19 2.5 1.73 2.5z" /></svg>
                        <span>관리자 모드에서는 사용자와 프로젝트를 영구 삭제할 수 있습니다. 신중히 사용하세요.</span>
                    </div>

                    {error && (
                        <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 px-4 py-3 rounded-xl mb-6 animate-slide-down text-sm">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="admin-email" className={`block text-sm font-medium mb-2 transition-colors duration-200 ${focusedField === 'email' ? 'text-amber-300' : 'text-gray-400'}`}>
                                관리자 ID
                            </label>
                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                </div>
                                <input
                                    id="admin-email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onFocus={() => setFocusedField('email')}
                                    onBlur={() => setFocusedField(null)}
                                    className="input pl-12"
                                    placeholder="admin@example.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="admin-password" className={`block text-sm font-medium mb-2 transition-colors duration-200 ${focusedField === 'password' ? 'text-amber-300' : 'text-gray-400'}`}>
                                비밀번호
                            </label>
                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                </div>
                                <input
                                    id="admin-password"
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
                                    확인 중...
                                </span>
                            ) : '관리자 모드 입장'}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
                            ← 일반 화면으로 돌아가기
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
