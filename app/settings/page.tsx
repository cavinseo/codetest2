'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import PersonalAiConnection from '@/components/member/PersonalAiConnection';

interface SettingsData {
    google: {
        clientId: string;
        configured: boolean;
    };
    smtp: {
        host: string;
        port: number;
        user: string;
        configured: boolean;
    };
    ai?: AiSettingsData;
}

interface AiSettingsData {
    provider: 'rule' | 'local' | 'hermes' | 'api';
    localBaseUrl: string;
    localModel: string;
    hermesBaseUrl: string;
    hermesModel: string;
    providers: Array<{ id: string; label: string; available: boolean }>;
}

const AI_PROVIDER_GUIDE: Record<string, string> = {
    rule: '외부 연결 없이 항상 동작합니다. 다른 엔진이 실패하면 자동으로 여기로 넘어갑니다.',
    local: 'Ollama·LM Studio 등 로컬 서버를 사용합니다. 주소를 비워 두면 알려진 포트를 자동으로 찾습니다.',
    hermes: '헤르메스 에이전트가 설치돼 있으면 사용합니다. 자체 서버·Ollama·LM Studio 순으로 자동 탐지합니다.',
    api: '클라우드 LLM API 를 사용합니다. 주소와 키는 환경 변수로 설정합니다.',
};

export default function ServiceSettingsPage() {
    const [activeTab, setActiveTab] = useState<'google' | 'smtp' | 'ai'>('google');
    const [googleClientId, setGoogleClientId] = useState('');
    const [googleClientSecret, setGoogleClientSecret] = useState('');
    // SMTP 상태
    const [smtpHost, setSmtpHost] = useState('');
    const [smtpPort, setSmtpPort] = useState('587');
    const [smtpUser, setSmtpUser] = useState('');
    const [smtpPass, setSmtpPass] = useState('');

    // AI 엔진 상태
    const [aiForm, setAiForm] = useState<Omit<AiSettingsData, 'providers'> | null>(null);

    const [currentSettings, setCurrentSettings] = useState<SettingsData | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            if (res.ok) {
                const data = await res.json();
                setCurrentSettings(data);
                if (data.ai) {
                    const { providers: _providers, ...form } = data.ai as AiSettingsData;
                    void _providers;
                    setAiForm(form);
                }
            }
        } catch (error) {
            console.error('설정 로드 실패:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveGoogle = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    google: {
                        clientId: googleClientId,
                        clientSecret: googleClientSecret,
                    },
                }),
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: '✅ Google OAuth 설정이 저장되었습니다.' });
                setGoogleClientId('');
                setGoogleClientSecret('');
                await loadSettings();
            } else {
                setMessage({ type: 'error', text: data.error || '저장 실패' });
            }
        } catch {
            setMessage({ type: 'error', text: '서버 연결 실패' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveAi = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!aiForm) return;

        setIsSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ai: aiForm }),
            });

            const data = await res.json();

            if (res.ok) {
                const selected = data.ai?.providers?.find((p: { id: string }) => p.id === aiForm.provider);
                setMessage(selected && !selected.available && aiForm.provider !== 'rule'
                    ? { type: 'error', text: `⚠️ 저장했지만 ${selected.label} 에 연결되지 않습니다. 기본 엔진으로 자동 폴백됩니다.` }
                    : { type: 'success', text: '✅ AI 엔진 설정이 저장되었습니다.' });
                await loadSettings();
            } else {
                setMessage({ type: 'error', text: data.error || '저장 실패' });
            }
        } catch {
            setMessage({ type: 'error', text: '서버 연결 실패' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveSmtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    smtp: {
                        host: smtpHost,
                        port: parseInt(smtpPort) || 587,
                        user: smtpUser,
                        pass: smtpPass,
                    },
                }),
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: '✅ SMTP 메일 설정이 저장되었습니다.' });
                setSmtpPass('');
                await loadSettings();
            } else {
                setMessage({ type: 'error', text: data.error || '저장 실패' });
            }
        } catch {
            setMessage({ type: 'error', text: '서버 연결 실패' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900">
            {/* 헤더 */}
            <header className="bg-gray-800 border-b border-gray-700">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Link
                                href="/dashboard"
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                ← 대시보드
                            </Link>
                            <div className="h-6 w-px bg-gray-700" />
                            <div>
                                <h1 className="text-2xl font-bold text-white">⚙️ 서비스 설정</h1>
                                <p className="text-sm text-gray-400 mt-1">
                                    외부 서비스 연동 및 전역 설정을 관리합니다
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex gap-8">
                    {/* 사이드 탭 */}
                    <aside className="w-56 shrink-0">
                        <nav className="space-y-1">
                            <button
                                onClick={() => { setActiveTab('google'); setMessage(null); }}
                                className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${activeTab === 'google'
                                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
                            >
                                <span className="text-xl">🔗</span>
                                <div>
                                    <p className="font-medium text-sm">Google 연동</p>
                                    <p className="text-xs opacity-70">OAuth, Forms</p>
                                </div>
                                {currentSettings?.google.configured && (
                                    <span className="ml-auto w-2 h-2 bg-green-500 rounded-full" />
                                )}
                            </button>
                            <button
                                onClick={() => { setActiveTab('smtp'); setMessage(null); }}
                                className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${activeTab === 'smtp'
                                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
                            >
                                <span className="text-xl">📧</span>
                                <div>
                                    <p className="font-medium text-sm">이메일 (SMTP)</p>
                                    <p className="text-xs opacity-70">설문 초대 발송</p>
                                </div>
                                {currentSettings?.smtp?.configured && (
                                    <span className="ml-auto w-2 h-2 bg-green-500 rounded-full" />
                                )}
                            </button>
                            <button
                                onClick={() => { setActiveTab('ai'); setMessage(null); }}
                                className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${activeTab === 'ai'
                                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
                            >
                                <span className="text-xl">⚡</span>
                                <div>
                                    <p className="font-medium text-sm">AI 엔진</p>
                                    <p className="text-xs opacity-70">멘토링 기능</p>
                                </div>
                                {currentSettings?.ai && (
                                    <span className="ml-auto w-2 h-2 bg-green-500 rounded-full" />
                                )}
                            </button>
                        </nav>
                    </aside>

                    {/* 메인 콘텐츠 */}
                    <div className="flex-1 space-y-6">
                        {activeTab === 'google' && (
                            <>
                                {/* 현재 상태 */}
                                <div className="card">
                                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                        <span>🔗</span> Google 연동 상태
                                    </h2>
                                    <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-700/30">
                                        {isLoading ? (
                                            <span className="text-gray-400">로딩 중...</span>
                                        ) : currentSettings?.google.configured ? (
                                            <>
                                                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                                                <div>
                                                    <p className="text-green-400 font-semibold">연동됨</p>
                                                    <p className="text-sm text-gray-400">
                                                        Client ID: {currentSettings.google.clientId}
                                                    </p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-3 h-3 bg-gray-500 rounded-full" />
                                                <div>
                                                    <p className="text-gray-400 font-semibold">미설정</p>
                                                    <p className="text-sm text-gray-500">
                                                        Google OAuth 자격증명을 입력하세요
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* 설정 폼 */}
                                <div className="card">
                                    <h2 className="text-xl font-bold text-white mb-4">
                                        🔑 Google OAuth 설정
                                    </h2>

                                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                                        <h3 className="font-semibold text-blue-300 mb-2">📋 설정 방법</h3>
                                        <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
                                            <li>
                                                <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">Google Cloud Console</a> 접속
                                            </li>
                                            <li>프로젝트 생성 또는 선택</li>
                                            <li>&quot;APIs &amp; Services&quot; → &quot;Library&quot;에서 <strong>Google Forms API</strong> 활성화</li>
                                            <li>&quot;APIs &amp; Services&quot; → &quot;Credentials&quot;에서 OAuth 2.0 클라이언트 ID 생성</li>
                                            <li>
                                                승인된 리디렉션 URI 추가:{' '}
                                                <code className="bg-gray-700 px-2 py-0.5 rounded text-yellow-300 text-xs">
                                                    {typeof window !== 'undefined'
                                                        ? `${window.location.origin}/api/auth/google/callback`
                                                        : 'http://localhost:3000/api/auth/google/callback'}
                                                </code>
                                            </li>
                                            <li>생성된 Client ID와 Client Secret을 아래에 입력</li>
                                        </ol>
                                    </div>

                                    {message && (
                                        <div className={`p-4 rounded-lg mb-4 ${message.type === 'success' ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                                            {message.text}
                                        </div>
                                    )}

                                    <form onSubmit={handleSaveGoogle} className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Client ID *</label>
                                            <input type="text" value={googleClientId} onChange={(e) => setGoogleClientId(e.target.value)} required placeholder="xxxxx.apps.googleusercontent.com" className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Client Secret *</label>
                                            <input type="password" value={googleClientSecret} onChange={(e) => setGoogleClientSecret(e.target.value)} required placeholder="GOCSPX-xxxxxxxxxxxxxxxx" className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500" />
                                        </div>

                                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                                            <p className="text-sm text-yellow-300">⚠️ 서버 메모리에만 저장되며, 재시작 시 다시 입력해야 합니다.</p>
                                        </div>

                                        <button type="submit" disabled={isSaving} className="btn-primary w-full py-3 disabled:opacity-50">
                                            {isSaving ? '저장 중...' : '💾 설정 저장'}
                                        </button>
                                    </form>
                                </div>
                            </>
                        )}

                        {activeTab === 'smtp' && (
                            <>
                                {/* SMTP 상태 */}
                                <div className="card">
                                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                        <span>📧</span> 이메일 발송 상태
                                    </h2>
                                    <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-700/30">
                                        {isLoading ? (
                                            <span className="text-gray-400">로딩 중...</span>
                                        ) : currentSettings?.smtp?.configured ? (
                                            <>
                                                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                                                <div>
                                                    <p className="text-green-400 font-semibold">설정됨</p>
                                                    <p className="text-sm text-gray-400">
                                                        SMTP: {currentSettings.smtp.host}:{currentSettings.smtp.port} ({currentSettings.smtp.user})
                                                    </p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                                                <div>
                                                    <p className="text-yellow-400 font-semibold">미설정</p>
                                                    <p className="text-sm text-gray-500">
                                                        SMTP를 설정하면 설문 초대 이메일이 자동 발송됩니다
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* SMTP 설정 폼 */}
                                <div className="card">
                                    <h2 className="text-xl font-bold text-white mb-4">
                                        📧 SMTP 메일 서버 설정
                                    </h2>

                                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                                        <h3 className="font-semibold text-blue-300 mb-2">💡 일반적인 SMTP 설정</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-300">
                                            <div className="p-2 bg-gray-700/30 rounded">
                                                <p className="font-medium text-white">Gmail</p>
                                                <p>smtp.gmail.com / 587</p>
                                                <p className="text-xs text-gray-500">앱 비밀번호 필요</p>
                                            </div>
                                            <div className="p-2 bg-gray-700/30 rounded">
                                                <p className="font-medium text-white">Naver</p>
                                                <p>smtp.naver.com / 587</p>
                                                <p className="text-xs text-gray-500">POP3/SMTP 사용 설정 필요</p>
                                            </div>
                                            <div className="p-2 bg-gray-700/30 rounded">
                                                <p className="font-medium text-white">Outlook</p>
                                                <p>smtp.office365.com / 587</p>
                                                <p className="text-xs text-gray-500">계정 비밀번호 사용</p>
                                            </div>
                                            <div className="p-2 bg-gray-700/30 rounded">
                                                <p className="font-medium text-white">Daum/Kakao</p>
                                                <p>smtp.daum.net / 465</p>
                                                <p className="text-xs text-gray-500">SSL 사용</p>
                                            </div>
                                        </div>
                                    </div>

                                    {message && (
                                        <div className={`p-4 rounded-lg mb-4 ${message.type === 'success' ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                                            {message.text}
                                        </div>
                                    )}

                                    <form onSubmit={handleSaveSmtp} className="space-y-4">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="col-span-2">
                                                <label className="block text-sm font-medium text-gray-300 mb-2">SMTP 호스트 *</label>
                                                <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} required placeholder="smtp.gmail.com" className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-2">포트 *</label>
                                                <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} required placeholder="587" className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">이메일 주소 (계정) *</label>
                                            <input type="email" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} required placeholder="your-email@gmail.com" className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">비밀번호 (앱 비밀번호) *</label>
                                            <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} required placeholder="앱 비밀번호 입력" className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500" />
                                            <p className="text-xs text-gray-500 mt-1">Gmail은 Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호에서 생성</p>
                                        </div>

                                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                                            <p className="text-sm text-yellow-300">⚠️ 서버 메모리에만 저장되며, 재시작 시 다시 입력해야 합니다.</p>
                                        </div>

                                        <button type="submit" disabled={isSaving} className="btn-primary w-full py-3 disabled:opacity-50">
                                            {isSaving ? '저장 중...' : '💾 SMTP 설정 저장'}
                                        </button>
                                    </form>
                                </div>

                                {/* 이메일 기능 소개 */}
                                <div className="card">
                                    <h2 className="text-xl font-bold text-white mb-4">
                                        📬 이메일 발송 기능
                                    </h2>
                                    <div className="space-y-3">
                                        <div className="flex items-start gap-3 p-3 bg-gray-700/30 rounded-lg">
                                            <span className="text-2xl">✉️</span>
                                            <div>
                                                <p className="text-white font-medium">Kano 설문 초대 이메일</p>
                                                <p className="text-sm text-gray-400">
                                                    응답자를 초대하면 설문 링크가 포함된 이메일이 자동으로 발송됩니다.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3 p-3 bg-gray-700/30 rounded-lg">
                                            <span className="text-2xl">🔗</span>
                                            <div>
                                                <p className="text-white font-medium">SMTP 미설정 시</p>
                                                <p className="text-sm text-gray-400">
                                                    이메일 대신 설문 링크가 생성되어 직접 복사해서 공유할 수 있습니다.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'ai' && (
                            <>
                                {/* 내 AI 연결 — 모든 회원. 프로필 화면과 같은 카드다. */}
                                <PersonalAiConnection />

                                {/* 아래 전역 엔진 설정은 관리자 전용 API(/api/settings)가
                                    데이터를 준 경우에만 편집할 수 있다. 일반 회원에게는
                                    빈자리 대신 "어디로 갔는지"를 설명하는 안내를 남긴다 —
                                    말없이 숨기면 기능이 사라진 것처럼 보인다. */}
                                {currentSettings?.ai ? (
                                <>
                                {/* 엔진별 연결 상태 */}
                                <div className="card">
                                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                        <span>⚡</span> 서비스 전역 AI 엔진 <span className="text-xs font-normal text-gray-500">(관리자)</span>
                                    </h2>
                                    <p className="text-sm text-gray-400 mb-4">
                                        개인 키를 등록하지 않은 회원의 AI 멘토링이 사용할 기본 엔진입니다.
                                        선택한 엔진에 연결되지 않으면 기본 엔진으로 자동 폴백되므로 기능이 멈추지는 않습니다.
                                    </p>
                                    {isLoading ? (
                                        <span className="text-gray-400">로딩 중...</span>
                                    ) : (
                                        <div className="space-y-2">
                                            {currentSettings?.ai?.providers.map((provider) => (
                                                <div
                                                    key={provider.id}
                                                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-700/30"
                                                >
                                                    <div className={`w-3 h-3 rounded-full ${provider.available ? 'bg-green-500' : 'bg-gray-600'}`} />
                                                    <span className="text-white font-medium">{provider.label}</span>
                                                    {currentSettings.ai?.provider === provider.id && (
                                                        <span className="text-xs px-2 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30">
                                                            사용 중
                                                        </span>
                                                    )}
                                                    <span className="ml-auto text-sm text-gray-400">
                                                        {provider.available ? '연결됨' : '연결 안 됨'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 엔진 선택 및 주소 설정 */}
                                {aiForm && (
                                    <div className="card">
                                        <h2 className="text-xl font-bold text-white mb-4">엔진 선택</h2>
                                        <form onSubmit={handleSaveAi} className="space-y-5">
                                            <div className="space-y-2">
                                                {(['rule', 'local', 'hermes', 'api'] as const).map((id) => (
                                                    <label
                                                        key={id}
                                                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${aiForm.provider === id
                                                            ? 'border-blue-500/40 bg-blue-600/10'
                                                            : 'border-gray-700 hover:bg-gray-800/50'
                                                            }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="ai-provider"
                                                            value={id}
                                                            checked={aiForm.provider === id}
                                                            onChange={() => setAiForm({ ...aiForm, provider: id })}
                                                            className="mt-1"
                                                        />
                                                        <div>
                                                            <p className="text-white font-medium text-sm">
                                                                {currentSettings?.ai?.providers.find((p) => p.id === id)?.label ?? id}
                                                            </p>
                                                            <p className="text-xs text-gray-400 mt-0.5">{AI_PROVIDER_GUIDE[id]}</p>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm text-gray-400 mb-1">로컬 AI 주소</label>
                                                    <input
                                                        type="text"
                                                        value={aiForm.localBaseUrl}
                                                        onChange={(e) => setAiForm({ ...aiForm, localBaseUrl: e.target.value })}
                                                        className="input w-full"
                                                        placeholder="http://localhost:11434/v1"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm text-gray-400 mb-1">로컬 AI 모델</label>
                                                    <input
                                                        type="text"
                                                        value={aiForm.localModel}
                                                        onChange={(e) => setAiForm({ ...aiForm, localModel: e.target.value })}
                                                        className="input w-full"
                                                        placeholder="비우면 설치된 모델 중 자동 선택"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm text-gray-400 mb-1">헤르메스 주소</label>
                                                    <input
                                                        type="text"
                                                        value={aiForm.hermesBaseUrl}
                                                        onChange={(e) => setAiForm({ ...aiForm, hermesBaseUrl: e.target.value })}
                                                        className="input w-full"
                                                        placeholder="http://localhost:8080/v1"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm text-gray-400 mb-1">헤르메스 모델</label>
                                                    <input
                                                        type="text"
                                                        value={aiForm.hermesModel}
                                                        onChange={(e) => setAiForm({ ...aiForm, hermesModel: e.target.value })}
                                                        className="input w-full"
                                                        placeholder="비우면 hermes 가 포함된 모델 자동 선택"
                                                    />
                                                </div>
                                            </div>

                                            <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-500/20">
                                                <p className="text-xs text-blue-200">
                                                    로컬 AI 와 헤르메스는 이 앱이 실행 중인 컴퓨터에서만 연결됩니다.
                                                    Vercel 배포 환경에서는 기본 엔진 또는 클라우드 API 만 동작합니다.
                                                </p>
                                            </div>

                                            <button type="submit" disabled={isSaving} className="btn-primary disabled:opacity-50">
                                                {isSaving ? '저장 중...' : 'AI 엔진 설정 저장'}
                                            </button>
                                        </form>
                                    </div>
                                )}
                                </>
                                ) : (
                                    <div className="card">
                                        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                                            <span>⚡</span> 서비스 전역 AI 엔진 <span className="text-xs font-normal text-gray-500">(관리자)</span>
                                        </h2>
                                        <p className="text-sm text-gray-400">
                                            규칙 기반 · 로컬 AI(Ollama · LM Studio) · 헤르메스 · 클라우드 API 등
                                            서비스 공통 엔진 설정은 그대로 있습니다. <span className="text-gray-300">관리자
                                            계정으로 로그인하면</span> 이 자리에 표시됩니다. 일반 회원은 위의
                                            「내 AI 연결」로 본인 키를 등록해 쓸 수 있습니다.
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
