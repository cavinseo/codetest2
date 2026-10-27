'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import KanoSurveyPreview from '@/components/KanoSurveyPreview';
import KanoOfflineFormPreview from '@/components/KanoOfflineFormPreview';
import KanoAnalysisPanel, { type KanoAnalysisData, type KanoAnalysisViewMode } from '@/components/project/KanoAnalysisPanel';
import KanoInviteModal from '@/components/project/KanoInviteModal';
import HeaderToast from '@/components/HeaderToast';
import KanoResponseCollection from './KanoResponseCollection';
import { useKanoResponseCollection } from './useKanoResponseCollection';
import { useToast } from '@/components/useToast';
import { getKanoTopic } from '@/lib/utils/korean-utils';
import { resolveKanoQuestionPair } from '@/lib/kano-survey-document';
import { readJsonOrThrow } from '@/lib/client-fetch';

interface Requirement {
    id: string;
    category: string;
    subcategory?: string;
    requirement: string;
    kanoPositiveQ?: string | null;
    kanoNegativeQ?: string | null;
    kanoWeight?: number | null;
    order: number;
}

interface Invitation {
    id: string;
    email: string;
    // 읽기 전용 역할에게는 서버가 토큰을 내리지 않는다(설문 제출의 자격증명이라
    // 위조에 그대로 쓰인다). 그래서 없을 수 있는 값이다.
    token?: string;
    expiresAt: string;
    respondedAt?: string;
}

interface KanoManagerProps {
    projectId: string;
    initialView?: 'manage' | 'analysis';
}

export default function KanoManager({ projectId, initialView }: KanoManagerProps) {
    const [activeTab, setActiveTab] = useState<'manage' | 'analysis'>('manage');
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [showOfflinePreview, setShowOfflinePreview] = useState(false);
    const [googleConfigured, setGoogleConfigured] = useState(false);
    const [isResettingResponses, setIsResettingResponses] = useState(false);
    const [isResettingInvitations, setIsResettingInvitations] = useState(false);
    const [projectName, setProjectName] = useState('');

    const [analysis, setAnalysis] = useState<KanoAnalysisData | null>(null);
    const [analysisViewMode, setAnalysisViewMode] = useState<KanoAnalysisViewMode>('charts');
    const [respondentData, setRespondentData] = useState<any[]>([]);

    // Kano 질문 직접 입력 관리
    const [kanoQuestions, setKanoQuestions] = useState<Record<string, { positive: string; negative: string }>>({});
    // 사용자가 직접 고친 질문의 요구사항 id. loadData 가 질문 맵을 서버 기본값으로
    // 다시 만들기 때문에, 이 표시가 없으면 초대 발송·업로드 같은 다른 조작 한 번에
    // 저장 전 편집이 통째로 원래 문구로 돌아간다(화면에 경고도 없다).
    const editedQuestionIds = useRef<Set<string>>(new Set());
    const [isSavingQuestions, setIsSavingQuestions] = useState(false);

    const { toast, showToast } = useToast(3500);

    // 화면 전체 로딩은 처음 열 때만 쓴다. 저장·초대·업로드 뒤 다시 불러올 때마다 전체를
    // 로딩으로 바꾸면 하위 화면이 통째로 내려갔다 올라와, 방금 뜬 완료 알림이 사라지고 스크롤이
    // 맨 위로 튀었다(2026-10-25 코드 리뷰 B20). 다시 불러오기는 지금 화면을 둔 채 값만 바꾼다.
    const hasLoadedRef = useRef(false);

    const loadData = useCallback(async () => {
        if (!hasLoadedRef.current) setIsLoading(true);
        try {
            const projRes = await fetch(`/api/projects/${projectId}`);
            if (projRes.ok) {
                const projData = await projRes.json();
                setProjectName(projData.project?.name || projData.name || '프로젝트');
            }

            const reqRes = await fetch(`/api/projects/${projectId}/requirements`);
            if (reqRes.ok) {
                const reqData = await reqRes.json();
                const reqs = reqData.requirements || [];
                setRequirements(reqs);
                // Kano 질문 초기값 — 기본 문구의 정본은 lib/kano-survey-document 다. 화면이
                // 인쇄물(Word 설문지)과 어긋나면 안 되므로 같은 규칙으로 채운다.
                const qMap: Record<string, { positive: string; negative: string }> = {};
                for (const r of reqs) {
                    qMap[r.id] = resolveKanoQuestionPair(r);
                }
                // 손대지 않은 질문만 서버 기본값으로 새로 고치고, 사용자가 고친
                // 것은 그대로 둔다.
                setKanoQuestions((prev) => {
                    const merged = { ...qMap };
                    for (const id of editedQuestionIds.current) {
                        if (prev[id]) merged[id] = prev[id];
                    }
                    return merged;
                });
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

            const respondentsRes = await fetch(`/api/projects/${projectId}/kano/responses`);
            if (respondentsRes.ok) {
                const respData = await respondentsRes.json();
                setRespondentData(respData.respondents || []);
            }
        } catch (error) {
            console.error('데이터 로드 실패:', error);
        } finally {
            hasLoadedRef.current = true;
            setIsLoading(false);
        }
    }, [projectId]);

    const copyInvitationLink = (token: string) => {
        const link = `${window.location.origin}/survey/${token}`;
        navigator.clipboard.writeText(link);
        showToast('초대 링크가 복사되었습니다!', 'info');
    };

    const collection = useKanoResponseCollection({ projectId, projectName, loadData, showToast });

    // 다른 프로젝트로 바뀌면 이전 프로젝트 값이 보이지 않게 다시 전체 로딩부터 한다.
    useEffect(() => {
        hasLoadedRef.current = false;
        loadData();
    }, [loadData]);
    useEffect(() => { if (initialView) setActiveTab(initialView); }, [initialView]);

    const handleResetResponses = async () => {
        const ok = window.confirm('현재 프로젝트의 Kano 응답 데이터와 응답 완료 상태를 모두 리셋할까요? 이 작업은 되돌릴 수 없습니다.');
        if (!ok) return;

        setIsResettingResponses(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/kano/responses`, {
                method: 'DELETE',
            });
            const data = await readJsonOrThrow(res, '응답 데이터 리셋에 실패했습니다.');

            collection.forgetCreatedForm();
            setRespondentData([]);
            setAnalysis({ totalResponses: 0, uniqueRespondents: 0, requirements: [] });
            showToast(data.message || '응답 데이터가 리셋되었습니다.', 'success');
            await loadData();
        } catch (error: any) {
            showToast(error.message || '응답 데이터 리셋에 실패했습니다.', 'error');
        } finally {
            setIsResettingResponses(false);
        }
    };

    const handleResetInvitations = async () => {
        const ok = window.confirm('현재 프로젝트의 Kano 응답 데이터와 응답자 초대 내역을 모두 리셋할까요? 이 작업은 되돌릴 수 없습니다.');
        if (!ok) return;

        setIsResettingInvitations(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/kano/responses?includeInvitations=true`, {
                method: 'DELETE',
            });
            const data = await readJsonOrThrow(res, '초대 내역 리셋에 실패했습니다.');

            collection.forgetCreatedForm();
            setInvitations([]);
            setRespondentData([]);
            setAnalysis({ totalResponses: 0, uniqueRespondents: 0, requirements: [] });
            showToast(data.message || '초대 내역이 리셋되었습니다.', 'success');
            await loadData();
        } catch (error: any) {
            showToast(error.message || '초대 내역 리셋에 실패했습니다.', 'error');
        } finally {
            setIsResettingInvitations(false);
        }
    };

    // Kano \uc9c8\ubb38 \uc800\uc7a5
    const handleSaveKanoQuestions = async () => {
        if (isSavingQuestions) return;
        setIsSavingQuestions(true);
        try {
            // \uae30\uc874 \uc694\uad6c\uc0ac\ud56d\uc5d0 Kano \uc9c8\ubb38\uc744 \ud569\uccd9\ud558\uc5ec \uc800\uc7a5
            const updatedRequirements = requirements.map((req) => ({
                id: req.id,
                category: req.category,
                subcategory: req.subcategory ?? null,
                requirement: req.requirement,
                kanoPositiveQ: kanoQuestions[req.id]?.positive || null,
                kanoNegativeQ: kanoQuestions[req.id]?.negative || null,
                kanoWeight: req.kanoWeight ?? null,
                order: req.order,
            }));
            const res = await fetch(`/api/projects/${projectId}/requirements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requirements: updatedRequirements }),
            });
            
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || errorData.message || '\uc800\uc7a5 \uc2e4\ud328');
            }
            
            showToast('Kano \uc124\ubb38 \uc9c8\ubb38\uc774 \uc800\uc7a5\ub418\uc5c8\uc2b5\ub2c8\ub2e4!', 'success');
            await loadData(); // \ucd5c\uc2e0 \ub370\uc774\ud130 \ub2e4\uc2dc \ubd88\ub7ec\uc624\uae30
        } catch (error: any) {
            console.error('Kano Save Error:', error);
            showToast(`\uc624\ub958: ${error.message}`, 'error');
        } finally {
            setIsSavingQuestions(false);
        }
    };

    const openResponseResults = () => {
        setAnalysisViewMode('respondents');
        setActiveTab('analysis');
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
            {toast && <HeaderToast message={toast.message} type={toast.type} />}

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

            {activeTab === 'manage' && (
                <div className="flex justify-end">
                    <button type="button" onClick={handleSaveKanoQuestions} disabled={isSavingQuestions || requirements.length === 0} className="btn-primary text-sm disabled:opacity-50">
                        {isSavingQuestions ? '저장 중...' : '저장'}
                    </button>
                </div>
            )}

            {/* ===== 설문 관리 탭 ===== */}
            {activeTab === 'manage' && (
                <div className="space-y-6 animate-fade-in">
                    {/* 통계 카드 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: '설문 질문', value: `${requirements.length}개`, sub: '긍정/부정 2문항이 1세트', color: 'text-blue-400', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
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

                    <div className="flex justify-end">
                        <div className="flex flex-wrap justify-end gap-2">
                            <button
                                onClick={openResponseResults}
                                className="btn-secondary inline-flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                응답 결과 보기
                            </button>
                            <button
                                onClick={handleResetResponses}
                                disabled={isResettingResponses || (!analysis?.totalResponses && respondentData.length === 0)}
                                className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50 disabled:hover:bg-red-500/10"
                            >
                                {isResettingResponses ? (
                                    <div className="w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4h6v3m-8 0h10" />
                                    </svg>
                                )}
                                응답 데이터 리셋
                            </button>
                        </div>
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

                    {/* 응답 수집 방식은 목적이 달라 한 카드 안에서 선택해야 혼동이 없다. */}
                    {requirements.length > 0 && (
                        <KanoResponseCollection
                            projectId={projectId}
                            requirementCount={requirements.length}
                            googleConfigured={googleConfigured}
                            collection={collection}
                            showToast={showToast}
                            onOpenPreview={() => setShowPreview(true)}
                            onOpenOfflinePreview={() => setShowOfflinePreview(true)}
                        />
                    )}

                    {/* 설문 질문 구성 */}
                    {requirements.length > 0 && (
                        <div className="card">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
                                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    설문 질문 구성 <span className="text-primary-400">({requirements.length}개 질문 세트)</span>
                                </h2>
                                <div className="flex items-center gap-2">
                                    <a
                                        href={`/api/projects/${projectId}/kano/survey-document`}
                                        className={`btn-secondary text-sm flex items-center gap-2${isSavingQuestions ? ' pointer-events-none opacity-50' : ''}`}
                                        aria-disabled={isSavingQuestions}
                                        title="저장된 질문으로 종이 설문지(.docx)를 만듭니다"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        설문지 Word 내려받기
                                    </a>
                                    <button
                                        onClick={handleSaveKanoQuestions}
                                        disabled={isSavingQuestions}
                                        className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {isSavingQuestions ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                        질문 저장
                                    </button>
                                </div>
                            </div>

                            <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl p-4 mb-5">
                                <p className="text-sm text-amber-200 flex items-start gap-2">
                                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>
                                        <strong className="text-amber-300">설문 주제</strong>는 자동 추출되며,
                                        <strong className="text-amber-300"> 긍정·부정 질문</strong>은 직접 수정하신 후 <strong className="text-white">「질문 저장」</strong> 버튼을 눌러주세요.
                                        저장된 질문이 미리보기, Google Forms, Word 설문지에 반영됩니다. 저장하지 않은 수정은 인쇄물에 나가지 않습니다.
                                    </span>
                                </p>
                            </div>

                            <div className="space-y-4">
                                {requirements.map((req, index) => {
                                    const topic = getKanoTopic(req.requirement);
                                    const q = kanoQuestions[req.id] || { positive: '', negative: '' };
                                    return (
                                        <div key={req.id} className="border border-white/[0.08] rounded-xl overflow-hidden">
                                            {/* 주제 헤더 */}
                                            <div className="bg-white/[0.04] px-4 py-3 flex items-center gap-3 border-b border-white/[0.06]">
                                                <span className="w-7 h-7 flex items-center justify-center bg-primary-500/20 text-primary-300 rounded-lg text-xs font-bold flex-shrink-0">
                                                    {index + 1}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    {req.category && (
                                                        <span className="text-xs text-blue-400">{req.category}{req.subcategory && ` > ${req.subcategory}`}</span>
                                                    )}
                                                    <p className="text-gray-400 text-xs mt-0.5">원본: {req.requirement}</p>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">설문 주제</span>
                                                    <span className="bg-primary-500/15 border border-primary-500/30 text-primary-300 text-xs font-semibold px-3 py-1 rounded-full">
                                                        {topic}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* 질문 입력 폼 */}
                                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* 긍정 질문 */}
                                                <div>
                                                    <label className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                                                        <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">👍</span>
                                                        긍정 질문 (Functional)
                                                    </label>
                                                    <textarea
                                                        value={q.positive}
                                                        onChange={(e) => {
                                                            editedQuestionIds.current.add(req.id);
                                                            setKanoQuestions(prev => ({
                                                                ...prev,
                                                                [req.id]: { ...prev[req.id], positive: e.target.value }
                                                            }));
                                                        }}
                                                        rows={2}
                                                        placeholder={`${topic}(이)라면 어떻게 생각하십니까?`}
                                                        className="w-full px-3 py-2 bg-emerald-500/[0.05] border border-emerald-500/20 hover:border-emerald-500/40 focus:border-emerald-500/60 rounded-lg text-white text-sm resize-none transition-colors outline-none placeholder:text-gray-600"
                                                    />
                                                </div>
                                                {/* 부정 질문 */}
                                                <div>
                                                    <label className="text-[10px] font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                                                        <span className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center">👎</span>
                                                        부정 질문 (Dysfunctional)
                                                    </label>
                                                    <textarea
                                                        value={q.negative}
                                                        onChange={(e) => {
                                                            editedQuestionIds.current.add(req.id);
                                                            setKanoQuestions(prev => ({
                                                                ...prev,
                                                                [req.id]: { ...prev[req.id], negative: e.target.value }
                                                            }));
                                                        }}
                                                        rows={2}
                                                        placeholder={`${topic}(이)가 아니라면 어떻게 생각하십니까?`}
                                                        className="w-full px-3 py-2 bg-red-500/[0.05] border border-red-500/20 hover:border-red-500/40 focus:border-red-500/60 rounded-lg text-white text-sm resize-none transition-colors outline-none placeholder:text-gray-600"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
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
                            <div className="mb-4 flex justify-end">
                                <button
                                    onClick={handleResetInvitations}
                                    disabled={isResettingInvitations}
                                    className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/25 disabled:opacity-50 disabled:hover:bg-red-500/15"
                                >
                                    {isResettingInvitations ? (
                                        <div className="w-4 h-4 border-2 border-red-200 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8m-2 11H5a2 2 0 01-2-2V7m16 12a2 2 0 002-2V7m-6 8l4 4m0-4l-4 4" />
                                        </svg>
                                    )}
                                    초대 내역 리셋
                                </button>
                            </div>
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
                                        {inv.token && (
                                            <button
                                                onClick={() => inv.token && copyInvitationLink(inv.token)}
                                                className="btn-ghost text-sm flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                </svg>
                                                링크 복사
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ===== 분석 결과 탭 ===== */}
            {activeTab === 'analysis' && (
                <KanoAnalysisPanel
                    projectId={projectId}
                    analysis={analysis}
                    requirements={requirements}
                    respondentData={respondentData}
                    analysisViewMode={analysisViewMode}
                    setAnalysisViewMode={setAnalysisViewMode}
                    onGoToManage={() => setActiveTab('manage')}
                    handleResetResponses={handleResetResponses}
                    isResettingResponses={isResettingResponses}
                    loadData={loadData}
                />
            )}

            {/* 설문 미리보기 모달 */}
            {showOfflinePreview && (
                <KanoOfflineFormPreview key={projectId} projectId={projectId} onClose={() => setShowOfflinePreview(false)} />
            )}
            {showPreview && (
                <KanoSurveyPreview
                    projectName={projectName}
                    requirements={requirements}
                    onClose={() => setShowPreview(false)}
                />
            )}

            {/* 초대 모달 */}
            <KanoInviteModal
                projectId={projectId}
                open={showInviteModal}
                onClose={() => setShowInviteModal(false)}
                onInvited={loadData}
                showToast={showToast}
            />
        </div>
    );
}
