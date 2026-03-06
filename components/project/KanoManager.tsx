'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import KanoSurveyPreview from '@/components/KanoSurveyPreview';
import Kano2DChart from '@/components/Kano2DChart';
import CategoryPieChart from '@/components/CategoryPieChart';

interface Requirement {
    id: string;
    category: string;
    subcategory?: string;
    requirement: string;
    order: number;
}

interface Invitation {
    id: string;
    email: string;
    token: string;
    expiresAt: string;
    respondedAt?: string;
}

interface AnalysisResult {
    requirementId: string;
    responseCount: number;
    aggregated: {
        M: number;
        O: number;
        A: number;
        I: number;
        R: number;
        Q: number;
    };
    better: number;
    worse: number;
    timkoCategory: string;
    quadrant: string;
}

interface AnalysisData {
    totalResponses: number;
    uniqueRespondents: number;
    requirements: AnalysisResult[];
}

interface KanoManagerProps {
    projectId: string;
    initialView?: 'manage' | 'analysis';
}

type ToastType = 'success' | 'error' | 'info';

export default function KanoManager({ projectId, initialView }: KanoManagerProps) {
    const [activeTab, setActiveTab] = useState<'manage' | 'analysis'>('manage');
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    const [inviteError, setInviteError] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const [googleConfigured, setGoogleConfigured] = useState(false);
    const [isCreatingForm, setIsCreatingForm] = useState(false);
    const [createdFormUrl, setCreatedFormUrl] = useState('');
    const [createdFormId, setCreatedFormId] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importMessage, setImportMessage] = useState('');
    const [projectName, setProjectName] = useState('');

    const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
    const [analysisViewMode, setAnalysisViewMode] = useState<'list' | 'charts'>('charts');

    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (message: string, type: ToastType = 'success') => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ message, type });
        toastTimerRef.current = setTimeout(() => setToast(null), 3500);
    };

    useEffect(() => { loadData(); }, [projectId]);
    useEffect(() => { if (initialView) setActiveTab(initialView); }, [initialView]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const projRes = await fetch(`/api/projects/${projectId}`);
            if (projRes.ok) {
                const projData = await projRes.json();
                setProjectName(projData.project?.name || projData.name || '프로젝트');
            }

            const reqRes = await fetch(`/api/projects/${projectId}/requirements`);
            if (reqRes.ok) {
                const reqData = await reqRes.json();
                setRequirements(reqData.requirements || []);
            }

            const invRes = await fetch(`/api/projects/${projectId}/kano/invitations`);
            if (invRes.ok) {
                const invData = await invRes.json();
                setInvitations(invData.invitations || []);
            }

            const settingsRes = await fetch('/api/settings');
            if (settingsRes.ok) {
                const data = await settingsRes.json();
                setGoogleConfigured(data.google?.configured || false);
            }

            const analysisRes = await fetch(`/api/projects/${projectId}/kano/analysis`);
            if (analysisRes.ok) {
                const analysisData = await analysisRes.json();
                setAnalysis(analysisData);
            }
        } catch (error) {
            console.error('데이터 로드 실패:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setInviteError('');
        setIsInviting(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/kano/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '초대 실패');
            await loadData();
            setShowInviteModal(false);
            setInviteEmail('');
            showToast(data.message || `${inviteEmail}에게 초대가 생성되었습니다!`, 'success');
        } catch (error: any) {
            setInviteError(error.message);
        } finally {
            setIsInviting(false);
        }
    };

    const copyInvitationLink = (token: string) => {
        const link = `${window.location.origin}/survey/${token}`;
        navigator.clipboard.writeText(link);
        showToast('초대 링크가 복사되었습니다!', 'info');
    };

    const handleCreateGoogleForm = async () => {
        setIsCreatingForm(true);
        setImportMessage('');
        try {
            const res = await fetch(`/api/projects/${projectId}/kano/create-form`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName }),
            });
            const data = await res.json();
            if (data.needsAuth) {
                const returnUrl = `/project/${projectId}/kano`;
                window.location.href = `/api/auth/google?returnUrl=${encodeURIComponent(returnUrl)}&projectId=${projectId}`;
                return;
            }
            if (!res.ok) throw new Error(data.error);
            setCreatedFormUrl(data.formUrl);
            setCreatedFormId(data.formId);
            showToast(`Google Forms 설문지가 생성되었습니다! (${data.questionCount}개 질문)`, 'success');
        } catch (error: any) {
            showToast(`오류: ${error.message}`, 'error');
        } finally {
            setIsCreatingForm(false);
        }
    };

    const handleImportResponses = async () => {
        if (!createdFormId) {
            showToast('먼저 Google Forms 설문지를 생성하세요.', 'error');
            return;
        }
        setIsImporting(true);
        setImportMessage('');
        try {
            const res = await fetch(`/api/projects/${projectId}/kano/form-responses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ formId: createdFormId }),
            });
            const data = await res.json();
            if (data.needsAuth) {
                const returnUrl = `/project/${projectId}/kano`;
                window.location.href = `/api/auth/google?returnUrl=${encodeURIComponent(returnUrl)}&projectId=${projectId}`;
                return;
            }
            if (!res.ok) throw new Error(data.error);
            setImportMessage(`success:${data.message}`);
            showToast(data.message, 'success');
            await loadData();
        } catch (error: any) {
            setImportMessage(`error:${error.message}`);
            showToast(error.message, 'error');
        } finally {
            setIsImporting(false);
        }
    };

    const getRequirementInfo = (reqId: string) => requirements.find(r => r.id === reqId);

    const getCategoryColor = (category: string) => {
        const colors: Record<string, string> = {
            M: 'bg-red-500/20 text-red-300 border-red-500/40',
            O: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
            A: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
            I: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
            R: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
            Q: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
        };
        return colors[category] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';
    };

    const getCategoryName = (category: string) => {
        const names: Record<string, string> = {
            M: 'Must-be (당연적)',
            O: 'One-dimensional (일원적)',
            A: 'Attractive (매력적)',
            I: 'Indifferent (무관심)',
            R: 'Reverse (역)',
            Q: 'Questionable (의문)',
        };
        return names[category] || category;
    };

    const getQuadrantInfo = (quadrant: string) => {
        const info: Record<string, { name: string; description: string }> = {
            HIGH_IMPACT: { name: '높은 영향력', description: '구현 시 만족도 크게 증가, 미구현 시 불만 높음' },
            PERFORMANCE: { name: '성능형', description: '구현 시 만족, 미구현 시 불만' },
            EXCITEMENT: { name: '흥분형', description: '구현 시 크게 만족, 미구현 시 무관심' },
            LOW_IMPACT: { name: '낮은 영향력', description: '구현 여부와 무관하게 만족도 변화 적음' },
        };
        return info[quadrant] || { name: quadrant, description: '' };
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-16">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-gray-400 text-sm">로딩 중...</p>
                </div>
            </div>
        );
    }

    const respondedCount = invitations.filter(i => i.respondedAt).length;

    return (
        <div className="space-y-6 relative">
            {/* 인라인 토스트 */}
            {toast && (
                <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border animate-fade-in transition-all ${toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200'
                        : toast.type === 'error' ? 'bg-red-900/90 border-red-500/40 text-red-200'
                            : 'bg-blue-900/90 border-blue-500/40 text-blue-200'
                    }`}>
                    {toast.type === 'success' ? (
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    ) : toast.type === 'error' ? (
                        <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    )}
                    <span className="text-sm font-medium">{toast.message}</span>
                </div>
            )}

            {/* 탭 네비게이션 */}
            <div className="flex items-center justify-between">
                <div className="flex gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl w-fit">
                    <button
                        onClick={() => setActiveTab('manage')}
                        className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'manage'
                                ? 'bg-primary-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                            }`}
                    >
                        <span className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            설문 관리
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('analysis')}
                        className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'analysis'
                                ? 'bg-primary-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                            }`}
                    >
                        <span className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            분석 결과
                            {analysis && analysis.totalResponses > 0 && (
                                <span className="inline-flex items-center justify-center w-4 h-4 bg-primary-400/30 text-primary-300 rounded-full text-[10px]">
                                    {analysis.uniqueRespondents}
                                </span>
                            )}
                        </span>
                    </button>
                </div>
            </div>

            {/* ===== 설문 관리 탭 ===== */}
            {activeTab === 'manage' && (
                <div className="space-y-6 animate-fade-in">
                    {/* 통계 카드 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: '설문 질문', value: `${requirements.length * 2}개`, sub: `긍정/부정 각 ${requirements.length}개`, color: 'text-blue-400', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
                            { label: '초대 발송', value: `${invitations.length}명`, sub: '응답자 초대', color: 'text-purple-400', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> },
                            { label: '응답 완료', value: `${respondedCount}명`, sub: '설문 완료자', color: 'text-emerald-400', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
                            { label: '응답률', value: `${invitations.length > 0 ? Math.round((respondedCount / invitations.length) * 100) : 0}%`, sub: '완료/발송', color: 'text-amber-400', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg> },
                        ].map(item => (
                            <div key={item.label} className="card">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={item.color}>{item.icon}</span>
                                    <p className="text-xs text-gray-500">{item.label}</p>
                                </div>
                                <p className={`text-2xl font-bold font-display ${item.color}`}>{item.value}</p>
                                <p className="text-[11px] text-gray-600 mt-1">{item.sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* 요구사항 없음 */}
                    {requirements.length === 0 && (
                        <div className="card text-center py-14">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-display font-semibold text-white mb-2">고객 요구사항이 없습니다</h3>
                            <p className="text-gray-500 text-sm mb-6">Kano 설문을 생성하려면 먼저 고객 요구사항을 입력하세요</p>
                            <Link href={`/project/${projectId}/requirements`} className="btn-primary inline-flex">
                                요구사항 입력하기
                            </Link>
                        </div>
                    )}

                    {/* Google Forms 연동 */}
                    {requirements.length > 0 && (
                        <div className="card">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
                                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Google Forms 연동
                                    {googleConfigured ? (
                                        <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">연동됨</span>
                                    ) : (
                                        <span className="text-xs bg-white/[0.04] text-gray-500 border border-white/[0.08] px-2 py-0.5 rounded-full">미설정</span>
                                    )}
                                </h2>
                            </div>

                            {!googleConfigured ? (
                                <div className="bg-blue-500/[0.08] border border-blue-500/20 rounded-xl p-4">
                                    <p className="text-blue-300 text-sm mb-3">
                                        Google Forms로 Kano 설문지를 자동 생성하려면 먼저 Google OAuth를 설정하세요.
                                    </p>
                                    <Link href="/settings" className="btn-secondary text-sm inline-flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        서비스 설정으로 이동
                                    </Link>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <button
                                            onClick={() => setShowPreview(true)}
                                            className="p-4 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] rounded-xl transition-all text-left group"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center mb-3 group-hover:bg-white/[0.10] transition-colors">
                                                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-white text-sm font-semibold">설문 미리보기</h3>
                                            <p className="text-xs text-gray-500 mt-1">생성될 설문지 양식을 미리 확인합니다</p>
                                        </button>

                                        <button
                                            onClick={handleCreateGoogleForm}
                                            disabled={isCreatingForm}
                                            className="p-4 bg-blue-500/[0.08] border border-blue-500/20 hover:bg-blue-500/[0.14] hover:border-blue-500/30 rounded-xl transition-all text-left group disabled:opacity-50"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center mb-3">
                                                {isCreatingForm ? (
                                                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                                                    </svg>
                                                )}
                                            </div>
                                            <h3 className="text-blue-300 text-sm font-semibold">{isCreatingForm ? '생성 중...' : 'Google Forms 생성'}</h3>
                                            <p className="text-xs text-gray-500 mt-1">{requirements.length * 2}개 질문의 설문지를 자동 생성합니다</p>
                                        </button>

                                        <button
                                            onClick={handleImportResponses}
                                            disabled={isImporting || !createdFormId}
                                            className="p-4 bg-emerald-500/[0.08] border border-emerald-500/20 hover:bg-emerald-500/[0.14] hover:border-emerald-500/30 rounded-xl transition-all text-left group disabled:opacity-50"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center mb-3">
                                                {isImporting ? (
                                                    <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                    </svg>
                                                )}
                                            </div>
                                            <h3 className="text-emerald-300 text-sm font-semibold">{isImporting ? '가져오는 중...' : '응답 가져오기'}</h3>
                                            <p className="text-xs text-gray-500 mt-1">{createdFormId ? 'Google Forms 응답을 가져옵니다' : '먼저 설문지를 생성하세요'}</p>
                                        </button>
                                    </div>

                                    {/* 생성된 폼 URL */}
                                    {createdFormUrl && (
                                        <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl p-4">
                                            <h4 className="text-emerald-300 font-semibold text-sm mb-3 flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Google Forms 설문지가 생성되었습니다
                                            </h4>
                                            <div className="flex items-center gap-2">
                                                <input type="text" readOnly value={createdFormUrl}
                                                    className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-sm" />
                                                <button onClick={() => { navigator.clipboard.writeText(createdFormUrl); showToast('링크가 복사되었습니다!', 'info'); }}
                                                    className="btn-secondary text-sm whitespace-nowrap flex items-center gap-1.5">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                    복사
                                                </button>
                                                <a href={createdFormUrl} target="_blank" rel="noopener noreferrer"
                                                    className="btn-primary text-sm whitespace-nowrap flex items-center gap-1.5">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                    </svg>
                                                    열기
                                                </a>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 설문 구성 */}
                    {requirements.length > 0 && (
                        <div className="card">
                            <h2 className="text-lg font-display font-bold text-white mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                설문 구성 <span className="text-primary-400">({requirements.length * 2}개 질문)</span>
                            </h2>
                            <div className="bg-primary-500/[0.06] border border-primary-500/20 rounded-xl p-4 mb-4">
                                <p className="text-sm text-gray-300">
                                    각 요구사항마다 <strong className="text-white">긍정 질문</strong>과 <strong className="text-white">부정 질문</strong> 2개씩 자동 생성됩니다.
                                    응답자는 5점 척도(매우 좋음 ~ 매우 싫음)로 답변합니다.
                                </p>
                            </div>

                            <div className="space-y-3">
                                {requirements.map((req, index) => (
                                    <div key={req.id} className="border border-white/[0.06] rounded-xl overflow-hidden">
                                        <div className="bg-white/[0.03] px-4 py-3 flex items-center gap-3">
                                            <span className="w-7 h-7 flex items-center justify-center bg-primary-500/20 text-primary-300 rounded-lg text-xs font-bold flex-shrink-0">
                                                {index + 1}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                {req.category && (
                                                    <span className="text-xs text-blue-400">{req.category}{req.subcategory && ` > ${req.subcategory}`}</span>
                                                )}
                                                <p className="text-white text-sm font-medium truncate">{req.requirement}</p>
                                            </div>
                                        </div>
                                        <div className="p-3 space-y-2">
                                            <div className="flex items-start gap-3 p-3 bg-emerald-500/[0.05] border border-emerald-500/15 rounded-lg">
                                                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </div>
                                                <div className="flex-1">
                                                    <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">긍정 질문 (Functional)</span>
                                                    <p className="text-gray-300 text-xs mt-0.5">&quot;만약 <span className="text-emerald-300 font-medium">{req.requirement}</span> 기능이 있다면?&quot;</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3 p-3 bg-red-500/[0.05] border border-red-500/15 rounded-lg">
                                                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </div>
                                                <div className="flex-1">
                                                    <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">부정 질문 (Dysfunctional)</span>
                                                    <p className="text-gray-300 text-xs mt-0.5">&quot;만약 <span className="text-red-300 font-medium">{req.requirement}</span> 기능이 없다면?&quot;</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 응답자 초대 버튼 */}
                    <div className="flex justify-end">
                        <button
                            onClick={() => setShowInviteModal(true)}
                            disabled={requirements.length === 0}
                            className="btn-primary disabled:opacity-50 flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            응답자 초대
                        </button>
                    </div>

                    {/* 초대 내역 */}
                    {invitations.length > 0 && (
                        <div className="card">
                            <h2 className="text-lg font-display font-bold text-white mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                초대 내역 <span className="text-gray-500 font-normal text-sm">({invitations.length}명)</span>
                            </h2>
                            <div className="space-y-2">
                                {invitations.map(inv => (
                                    <div key={inv.id} className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl group hover:border-white/[0.10] transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${inv.respondedAt ? 'bg-emerald-500/15' : 'bg-amber-500/15'}`}>
                                                {inv.respondedAt ? (
                                                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-white text-sm font-medium">{inv.email}</p>
                                                <p className="text-xs mt-0.5">
                                                    {inv.respondedAt ? (
                                                        <span className="text-emerald-400">응답 완료 · {new Date(inv.respondedAt).toLocaleDateString()}</span>
                                                    ) : (
                                                        <span className="text-amber-400">응답 대기 · 만료 {new Date(inv.expiresAt).toLocaleDateString()}</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => copyInvitationLink(inv.token)}
                                            className="btn-ghost text-sm flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                            </svg>
                                            링크 복사
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ===== 분석 결과 탭 ===== */}
            {activeTab === 'analysis' && (
                <div className="space-y-6 animate-fade-in">
                    {!analysis || analysis.totalResponses === 0 ? (
                        <div className="card text-center py-16">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                                <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-display font-semibold text-gray-300 mb-2">아직 응답이 없습니다</h3>
                            <p className="text-gray-500 text-sm mb-6">응답자를 초대하고 설문 응답을 수집하세요</p>
                            <button onClick={() => setActiveTab('manage')} className="btn-primary inline-flex">
                                설문 관리로 이동
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* 분석 통계 */}
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: '총 응답 수', value: `${analysis.totalResponses}개`, color: 'text-blue-400' },
                                    { label: '응답자 수', value: `${analysis.uniqueRespondents}명`, color: 'text-emerald-400' },
                                    { label: '분석 항목', value: `${analysis.requirements.length}개`, color: 'text-purple-400' },
                                ].map(item => (
                                    <div key={item.label} className="card text-center">
                                        <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                                        <p className={`text-2xl font-bold font-display ${item.color}`}>{item.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* 보기 토글 */}
                            <div className="flex justify-center">
                                <div className="flex gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl">
                                    <button
                                        onClick={() => setAnalysisViewMode('charts')}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${analysisViewMode === 'charts' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                                        </svg>
                                        차트 보기
                                    </button>
                                    <button
                                        onClick={() => setAnalysisViewMode('list')}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${analysisViewMode === 'list' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                        </svg>
                                        목록 보기
                                    </button>
                                </div>
                            </div>

                            {/* 차트 뷰 */}
                            {analysisViewMode === 'charts' && (
                                <div className="space-y-6">
                                    <div className="card">
                                        <h3 className="text-lg font-display font-bold text-white mb-4">Kano 2D 분석 차트</h3>
                                        <div className="flex justify-center">
                                            <Kano2DChart
                                                requirements={analysis.requirements.map((result, idx) => {
                                                    const reqInfo = getRequirementInfo(result.requirementId);
                                                    const dominantCategory = Object.entries(result.aggregated).reduce(
                                                        (max, [cat, count]) => count > max.count ? { category: cat, count } : max,
                                                        { category: 'I', count: 0 }
                                                    );
                                                    return {
                                                        id: result.requirementId,
                                                        name: reqInfo?.requirement || `요구사항 ${idx + 1}`,
                                                        better: result.better,
                                                        worse: result.worse,
                                                        category: dominantCategory.category,
                                                    };
                                                })}
                                            />
                                        </div>
                                    </div>
                                    <div className="card">
                                        <h3 className="text-lg font-display font-bold text-white mb-4">카테고리 분포</h3>
                                        <div className="flex justify-center">
                                            <CategoryPieChart
                                                distribution={analysis.requirements.reduce(
                                                    (acc, result) => {
                                                        const dominant = Object.entries(result.aggregated).reduce(
                                                            (max, [cat, count]) => count > max.count ? { category: cat, count } : max,
                                                            { category: 'I', count: 0 }
                                                        );
                                                        acc[dominant.category as keyof typeof acc]++;
                                                        return acc;
                                                    },
                                                    { M: 0, O: 0, A: 0, I: 0, R: 0, Q: 0 }
                                                )}
                                                total={analysis.requirements.length}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 목록 뷰 */}
                            {analysisViewMode === 'list' && (
                                <div className="space-y-3">
                                    {analysis.requirements.map((result, index) => {
                                        const reqInfo = getRequirementInfo(result.requirementId);
                                        const dominantCategory = Object.entries(result.aggregated).reduce(
                                            (max, [cat, count]) => count > max.count ? { category: cat, count } : max,
                                            { category: 'I', count: 0 }
                                        );
                                        return (
                                            <div key={result.requirementId} className="card">
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-xs text-gray-600 font-mono mt-1">#{index + 1}</span>
                                                        <h3 className="text-white font-semibold">{reqInfo?.requirement || `요구사항 ${result.requirementId}`}</h3>
                                                    </div>
                                                    <span className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex-shrink-0 ${getCategoryColor(dominantCategory.category)}`}>
                                                        {dominantCategory.category} · {getCategoryName(dominantCategory.category).split(' ')[0]}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="bg-emerald-500/[0.06] border border-emerald-500/15 rounded-xl p-3">
                                                        <p className="text-xs text-gray-500 mb-1">Better (충족 시 만족도↑)</p>
                                                        <p className="text-xl font-bold font-display text-emerald-400">{result.better.toFixed(2)}</p>
                                                    </div>
                                                    <div className="bg-red-500/[0.06] border border-red-500/15 rounded-xl p-3">
                                                        <p className="text-xs text-gray-500 mb-1">Worse (미충족 시 불만↑)</p>
                                                        <p className="text-xl font-bold font-display text-red-400">{Math.abs(result.worse).toFixed(2)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* 설문 미리보기 모달 */}
            {showPreview && (
                <KanoSurveyPreview
                    projectName={projectName}
                    requirements={requirements}
                    onClose={() => setShowPreview(false)}
                />
            )}

            {/* 초대 모달 */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="glass-strong max-w-md w-full p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
                                <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                응답자 초대
                            </h3>
                            <button
                                onClick={() => { setShowInviteModal(false); setInviteEmail(''); setInviteError(''); }}
                                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        {inviteError && (
                            <div className="bg-red-500/[0.08] border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-4 text-sm">{inviteError}</div>
                        )}
                        <form onSubmit={handleInvite} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">이메일 주소 *</label>
                                <input
                                    type="email"
                                    required
                                    value={inviteEmail}
                                    onChange={e => setInviteEmail(e.target.value)}
                                    className="input w-full"
                                    placeholder="customer@example.com"
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowInviteModal(false); setInviteEmail(''); setInviteError(''); }}
                                    className="flex-1 btn-secondary py-3"
                                >
                                    취소
                                </button>
                                <button type="submit" disabled={isInviting} className="flex-1 btn-primary py-3 disabled:opacity-50">
                                    {isInviting ? '발송 중...' : '초대 보내기'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
