'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import KanoSurveyPreview from '@/components/KanoSurveyPreview';
import Kano2DChart from '@/components/Kano2DChart';
import CategoryPieChart from '@/components/CategoryPieChart';
import KanoAggregationTable from '@/components/project/KanoAggregationTable';
import KanoRespondentTable from '@/components/project/KanoRespondentTable';
import { getKanoTopic } from '@/lib/utils/korean-utils';
import { resolveKanoQuestionPair } from '@/lib/kano-survey-document';

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
    token: string;
    expiresAt: string;
    respondedAt?: string;
}

interface BulkInviteResult {
    email: string;
    status: 'invited' | 'skipped' | 'failed';
    reason?: string;
}

interface BulkInviteSummary {
    invited: number;
    skipped: number;
    failed: number;
    emailSent: number;
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
        total: number;
        dominantCategory: any;
    };
    better: number;
    worse: number;
    kanoWeight?: number | null;
    timkoCategory?: string | null;
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
type ExcelUploadFormat = 'template' | 'googleForms';

export default function KanoManager({ projectId, initialView }: KanoManagerProps) {
    const kanoUploadTemplateUrl = `/api/projects/${projectId}/kano/upload-template`;
    const kanoFormScriptUrl = `/api/projects/${projectId}/kano/form-script`;
    const [activeTab, setActiveTab] = useState<'manage' | 'analysis'>('manage');
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    const [inviteError, setInviteError] = useState('');
    // 한 명씩 보낼지, 여러 명을 한 번에 보낼지
    const [inviteMode, setInviteMode] = useState<'single' | 'bulk'>('single');
    const [bulkEmailText, setBulkEmailText] = useState('');
    const [bulkFile, setBulkFile] = useState<File | null>(null);
    const [inviteResults, setInviteResults] = useState<BulkInviteResult[] | null>(null);
    const [inviteSummary, setInviteSummary] = useState<BulkInviteSummary | null>(null);
    const bulkFileInputRef = useRef<HTMLInputElement | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [googleConfigured, setGoogleConfigured] = useState(false);
    const [isCreatingForm, setIsCreatingForm] = useState(false);
    const [createdFormUrl, setCreatedFormUrl] = useState('');
    const [createdFormId, setCreatedFormId] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [isResettingResponses, setIsResettingResponses] = useState(false);
    const [isResettingInvitations, setIsResettingInvitations] = useState(false);
    const [isUploadingExcel, setIsUploadingExcel] = useState(false);
    const [excelFile, setExcelFile] = useState<File | null>(null);
    const [excelUploadFormat, setExcelUploadFormat] = useState<ExcelUploadFormat>('template');
    const [importMessage, setImportMessage] = useState('');
    const [projectName, setProjectName] = useState('');

    const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
    const [analysisViewMode, setAnalysisViewMode] = useState<'list' | 'charts' | 'respondents'>('charts');
    const [respondentData, setRespondentData] = useState<any[]>([]);

    // Kano 질문 직접 입력 관리
    const [kanoQuestions, setKanoQuestions] = useState<Record<string, { positive: string; negative: string }>>({});
    const [isSavingQuestions, setIsSavingQuestions] = useState(false);

    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const excelInputRef = useRef<HTMLInputElement | null>(null);

    const showToast = (message: string, type: ToastType = 'success') => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ message, type });
        toastTimerRef.current = setTimeout(() => setToast(null), 3500);
    };

    const loadData = useCallback(async () => {
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
                const reqs = reqData.requirements || [];
                setRequirements(reqs);
                // Kano 질문 초기값 — 기본 문구의 정본은 lib/kano-survey-document 다. 화면이
                // 인쇄물(Word 설문지)과 어긋나면 안 되므로 같은 규칙으로 채운다.
                const qMap: Record<string, { positive: string; negative: string }> = {};
                for (const r of reqs) {
                    qMap[r.id] = resolveKanoQuestionPair(r);
                }
                setKanoQuestions(qMap);
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
            setIsLoading(false);
        }
    }, [projectId]);

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

    const closeInviteModal = () => {
        setShowInviteModal(false);
        setInviteEmail('');
        setInviteError('');
        setBulkEmailText('');
        setBulkFile(null);
        setInviteResults(null);
        setInviteSummary(null);
        if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
    };

    // 붙여 넣은 주소 목록 또는 업로드한 명단 파일로 한 번에 초대한다.
    const handleBulkInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setInviteError('');
        setInviteResults(null);
        setInviteSummary(null);

        if (!bulkFile && !bulkEmailText.trim()) {
            setInviteError('초대할 이메일을 입력하거나 명단 파일을 선택하세요.');
            return;
        }

        setIsInviting(true);
        try {
            let response: Response;

            if (bulkFile) {
                const formData = new FormData();
                formData.append('file', bulkFile);
                response = await fetch(`/api/projects/${projectId}/kano/invite/bulk`, {
                    method: 'POST',
                    body: formData,
                });
            } else {
                response = await fetch(`/api/projects/${projectId}/kano/invite/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: bulkEmailText }),
                });
            }

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '일괄 초대에 실패했습니다.');

            await loadData();
            setInviteResults(data.results || []);
            setInviteSummary(data.summary || null);
            setBulkEmailText('');
            setBulkFile(null);
            if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
            showToast(data.message || '일괄 초대를 처리했습니다.', 'success');
        } catch (error: any) {
            setInviteError(error.message);
        } finally {
            setIsInviting(false);
        }
    };

    const handleBulkFileChange = (file: File | null) => {
        if (!file) {
            setBulkFile(null);
            return;
        }
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
            setInviteError('.xlsx 또는 .xls 파일만 업로드할 수 있습니다.');
            if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
            return;
        }
        setInviteError('');
        setBulkFile(file);
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
            showToast(`Google Forms 설문지가 생성되었습니다! (${data.questionCount}개 질문 세트)`, 'success');
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

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => { if (initialView) setActiveTab(initialView); }, [initialView]);

    const handleUploadExcelResponses = async () => {
        if (!excelFile) {
            showToast('업로드할 엑셀 파일을 선택하세요.', 'error');
            return;
        }

        const uploadPolicy = window.prompt('업로드 방식을 선택하세요.\n\n1: 기존 데이터에 추가\n2: 기존 응답/초대 데이터를 지우고 새롭게 업로드', '1');
        if (uploadPolicy === null) return;
        const shouldReplace = uploadPolicy.trim() === '2';
        if (!shouldReplace && uploadPolicy.trim() !== '1') {
            showToast('업로드 방식은 1 또는 2로 선택해주세요.', 'error');
            return;
        }

        setIsUploadingExcel(true);
        setImportMessage('');
        try {
            const formData = new FormData();
            formData.append('file', excelFile);
            formData.append('format', excelUploadFormat);
            formData.append('writePolicy', shouldReplace ? 'replace' : 'append');

            const res = await fetch(`/api/projects/${projectId}/kano/upload-excel`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '엑셀 업로드에 실패했습니다.');

            setImportMessage(`success:${data.message}`);
            showToast(data.message, 'success');
            setExcelFile(null);
            if (excelInputRef.current) excelInputRef.current.value = '';
            await loadData();
        } catch (error: any) {
            const message = error.message || '엑셀 업로드에 실패했습니다.';
            setImportMessage(`error:${message}`);
            showToast(message, 'error');
        } finally {
            setIsUploadingExcel(false);
        }
    };

    const handleResetResponses = async () => {
        const ok = window.confirm('현재 프로젝트의 Kano 응답 데이터와 응답 완료 상태를 모두 리셋할까요? 이 작업은 되돌릴 수 없습니다.');
        if (!ok) return;

        setIsResettingResponses(true);
        setImportMessage('');
        try {
            const res = await fetch(`/api/projects/${projectId}/kano/responses`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '응답 데이터 리셋에 실패했습니다.');

            setCreatedFormId('');
            setCreatedFormUrl('');
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
        setImportMessage('');
        try {
            const res = await fetch(`/api/projects/${projectId}/kano/responses?includeInvitations=true`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '초대 내역 리셋에 실패했습니다.');

            setCreatedFormId('');
            setCreatedFormUrl('');
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

    const getRequirementInfo = (reqId: string) => requirements.find(r => r.id === reqId);

    const openResponseResults = () => {
        setAnalysisViewMode('respondents');
        setActiveTab('analysis');
    };

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

                            <p className="text-sm text-gray-500 -mt-2 mb-4">
                                Google Forms로 설문지를 만들고 응답을 수집합니다
                            </p>
                                <div className="space-y-4">
                                    {/* 3단계 진행 흐름 */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {/* 1단계: 미리보기 */}
                                        <div className="p-4 bg-white/[0.03] border border-white/[0.08] rounded-xl flex flex-col">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-bold flex items-center justify-center">1</span>
                                                <span className="text-[11px] text-emerald-400">준비됨</span>
                                            </div>
                                            <h3 className="text-white text-sm font-semibold mb-3">미리보기</h3>
                                            <button
                                                onClick={() => setShowPreview(true)}
                                                className="mt-auto w-full px-3 py-2 rounded-lg border border-white/[0.10] bg-white/[0.04] hover:bg-white/[0.08] text-gray-200 text-xs font-semibold transition-colors"
                                            >
                                                양식 확인
                                            </button>
                                        </div>

                                        {/* 2단계: 설문지 생성 (Google 연동 필요) */}
                                        <div className={`p-4 rounded-xl flex flex-col border ${googleConfigured
                                            ? 'bg-blue-500/[0.08] border-blue-500/20'
                                            : 'bg-amber-500/[0.06] border-amber-500/25'
                                            }`}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${googleConfigured
                                                    ? 'bg-blue-500/15 text-blue-300'
                                                    : 'bg-amber-500/15 text-amber-300'
                                                    }`}>2</span>
                                                {googleConfigured ? (
                                                    <span className="text-[11px] text-blue-400">연동됨</span>
                                                ) : (
                                                    <span className="text-[11px] text-amber-400 flex items-center gap-1">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                        </svg>
                                                        설정 필요
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="text-white text-sm font-semibold mb-1">설문지 생성</h3>
                                            <p className="text-xs text-gray-500 mb-3">{requirements.length}개 질문 세트</p>
                                            {googleConfigured ? (
                                                <button
                                                    onClick={handleCreateGoogleForm}
                                                    disabled={isCreatingForm}
                                                    className="mt-auto w-full px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-500/15 hover:bg-blue-500/25 disabled:opacity-50 text-blue-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                                                >
                                                    {isCreatingForm && <span className="w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />}
                                                    {isCreatingForm ? '생성 중...' : 'Google Forms 생성'}
                                                </button>
                                            ) : (
                                                <Link
                                                    href="/settings"
                                                    className="mt-auto w-full px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                                                >
                                                    Google 설정하기
                                                </Link>
                                            )}
                                        </div>

                                        {/* 3단계: 응답 가져오기 */}
                                        <div className={`p-4 rounded-xl flex flex-col border ${createdFormId
                                            ? 'bg-emerald-500/[0.08] border-emerald-500/20'
                                            : 'bg-white/[0.02] border-white/[0.06]'
                                            }`}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${createdFormId
                                                    ? 'bg-emerald-500/15 text-emerald-300'
                                                    : 'bg-white/[0.06] text-gray-500'
                                                    }`}>3</span>
                                                <span className={`text-[11px] ${createdFormId ? 'text-emerald-400' : 'text-gray-500'}`}>
                                                    {createdFormId ? '수집 가능' : '2단계 후 진행'}
                                                </span>
                                            </div>
                                            <h3 className={`text-sm font-semibold mb-3 ${createdFormId ? 'text-white' : 'text-gray-500'}`}>응답 가져오기</h3>
                                            <button
                                                onClick={handleImportResponses}
                                                disabled={isImporting || !createdFormId}
                                                className="mt-auto w-full px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 disabled:hover:bg-emerald-500/15 text-emerald-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                                            >
                                                {isImporting && <span className="w-3 h-3 border-2 border-emerald-300 border-t-transparent rounded-full animate-spin" />}
                                                {isImporting ? '가져오는 중...' : createdFormId ? '응답 가져오기' : '대기 중'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* 보조 수단: Apps Script 직접 실행 */}
                                    <div className="pt-3 border-t border-white/[0.06]">
                                        <a
                                            href={kanoFormScriptUrl}
                                            className="text-xs text-gray-500 hover:text-gray-300 transition-colors inline-flex items-center gap-1.5"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                            </svg>
                                            Apps Script 파일 받기 (Google 연동 없이 수동 생성)
                                        </a>
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
                        </div>
                    )}

                    {/* 응답 파일 업로드 - Google 연동과 무관한 독립 경로 */}
                    {requirements.length > 0 && (
                        <div className="card">
                            <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
                                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 12l-4-4m4 4l4-4M4 20h16" />
                                </svg>
                                응답 파일로 업로드
                            </h2>
                            <p className="text-sm text-gray-500 mt-1 mb-4">
                                Google 연동 없이 엑셀 파일만으로 응답을 등록합니다
                            </p>

                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 flex flex-col lg:flex-row lg:items-center gap-3">
                                <select
                                    value={excelUploadFormat}
                                    onChange={(event) => setExcelUploadFormat(event.target.value as ExcelUploadFormat)}
                                    className="px-3 py-2 rounded-lg border border-amber-500/25 bg-black/20 text-amber-100 text-xs font-semibold outline-none focus:border-amber-500/50 lg:flex-shrink-0"
                                >
                                    <option value="template">전용 양식</option>
                                    <option value="googleForms">Google Forms 형식</option>
                                </select>

                                <a
                                    href={`${kanoUploadTemplateUrl}?format=${excelUploadFormat}`}
                                    className="px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 lg:flex-shrink-0"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                    </svg>
                                    양식 받기
                                </a>

                                <input
                                    ref={excelInputRef}
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={(event) => setExcelFile(event.target.files?.[0] ?? null)}
                                    className="flex-1 min-w-0 text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-500/15 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-amber-200 hover:file:bg-amber-500/25"
                                />

                                <button
                                    onClick={handleUploadExcelResponses}
                                    disabled={isUploadingExcel || !excelFile}
                                    className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:hover:bg-amber-600 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 lg:flex-shrink-0"
                                >
                                    {isUploadingExcel && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                    {isUploadingExcel ? '업로드 중...' : '업로드'}
                                </button>
                            </div>
                        </div>
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
                                                        onChange={(e) => setKanoQuestions(prev => ({
                                                            ...prev,
                                                            [req.id]: { ...prev[req.id], positive: e.target.value }
                                                        }))}
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
                                                        onChange={(e) => setKanoQuestions(prev => ({
                                                            ...prev,
                                                            [req.id]: { ...prev[req.id], negative: e.target.value }
                                                        }))}
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

                            <div className="flex justify-end">
                                <button
                                    onClick={handleResetResponses}
                                    disabled={isResettingResponses || analysis.totalResponses === 0}
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

                            {/* 보기 토글 */}
                            <div className="flex justify-center">
                                <div className="flex gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl flex-wrap">
                                    <button
                                        onClick={() => setAnalysisViewMode('charts')}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${analysisViewMode === 'charts' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                                        </svg>
                                        TIMKO
                                    </button>
                                    <button
                                        onClick={() => setAnalysisViewMode('respondents')}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${analysisViewMode === 'respondents' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                        </svg>
                                        응답자별 보기
                                    </button>
                                </div>
                            </div>


                            {/* 차트 뷰 */}
                            {analysisViewMode === 'charts' && (
                                <div className="space-y-6">
                                    <div className="card">
                                        <h3 className="text-lg font-display font-bold text-white mb-4">TIMKO 분석 차트</h3>
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
                                    <KanoAggregationTable
                                        projectId={projectId}
                                        onWeightsSaved={loadData}
                                        analysis={analysis.requirements.map(req => ({
                                            ...req,
                                            requirementName: getRequirementInfo(req.requirementId)?.requirement
                                        }))}
                                    />
                                </div>
                            )}

                            {/* 집계표 표 뷰 */}
                            {/* 제출자별 보기 */}
                            {analysisViewMode === 'respondents' && (
                                <KanoRespondentTable 
                                    respondents={respondentData}
                                    requirements={requirements}
                                />
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
                    <div className="glass-strong max-w-xl w-full p-6 max-h-[88vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
                                <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                응답자 초대
                            </h3>
                            <button
                                onClick={closeInviteModal}
                                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* 초대 방식 선택 */}
                        <div className="glass-strong inline-flex p-1 rounded-xl mb-5">
                            <button
                                type="button"
                                onClick={() => { setInviteMode('single'); setInviteError(''); }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${inviteMode === 'single'
                                    ? 'bg-primary-600/20 text-white border border-primary-500/25'
                                    : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                한 명 초대
                            </button>
                            <button
                                type="button"
                                onClick={() => { setInviteMode('bulk'); setInviteError(''); }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${inviteMode === 'bulk'
                                    ? 'bg-purple-600/20 text-white border border-purple-500/25'
                                    : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                여러 명 한번에
                            </button>
                        </div>

                        {inviteError && (
                            <div className="bg-red-500/[0.08] border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-4 text-sm">{inviteError}</div>
                        )}

                        {inviteMode === 'single' ? (
                            // key 를 주지 않으면 모드를 바꿀 때 React 가 두 폼의 input 을 같은 자리로 보고 재사용해
                            // controlled/uncontrolled 경고가 난다.
                            <form key="invite-single" onSubmit={handleInvite} className="space-y-4">
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
                                    <button type="button" onClick={closeInviteModal} className="flex-1 btn-secondary py-3">
                                        취소
                                    </button>
                                    <button type="submit" disabled={isInviting} className="flex-1 btn-primary py-3 disabled:opacity-50">
                                        {isInviting ? '발송 중...' : '초대 보내기'}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form key="invite-bulk" onSubmit={handleBulkInvite} className="space-y-4">
                                {/* 양식 다운로드 + 업로드 */}
                                <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.05] p-4">
                                    <div className="flex items-center justify-between gap-3 mb-3">
                                        <div>
                                            <p className="text-sm font-semibold text-purple-200">명단 양식으로 초대</p>
                                            <p className="text-[11px] text-gray-500 mt-0.5">양식을 내려받아 이메일을 채운 뒤 업로드하세요.</p>
                                        </div>
                                        <a
                                            href={`/api/projects/${projectId}/kano/invite-template`}
                                            className="btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                            </svg>
                                            양식 다운로드
                                        </a>
                                    </div>
                                    <input
                                        ref={bulkFileInputRef}
                                        type="file"
                                        accept=".xlsx,.xls"
                                        onChange={(event) => handleBulkFileChange(event.target.files?.[0] ?? null)}
                                        className="hidden"
                                        id={`kano-invite-upload-${projectId}`}
                                    />
                                    <label
                                        htmlFor={`kano-invite-upload-${projectId}`}
                                        className={`btn-secondary text-sm w-full flex items-center justify-center gap-1.5 ${isInviting ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                        </svg>
                                        {bulkFile ? bulkFile.name : '명단 파일 선택 (.xlsx)'}
                                    </label>
                                    {bulkFile && (
                                        <button
                                            type="button"
                                            onClick={() => handleBulkFileChange(null)}
                                            className="mt-2 text-[11px] text-gray-500 hover:text-gray-300"
                                        >
                                            선택한 파일 지우기
                                        </button>
                                    )}
                                </div>

                                {/* 직접 붙여넣기 */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        또는 이메일 직접 입력
                                    </label>
                                    <textarea
                                        value={bulkEmailText}
                                        onChange={e => setBulkEmailText(e.target.value)}
                                        rows={4}
                                        disabled={Boolean(bulkFile)}
                                        className="input w-full resize-y disabled:opacity-40"
                                        placeholder={'a@example.com\nb@example.com, c@example.com'}
                                    />
                                    <p className="text-[11px] text-gray-600 mt-1">
                                        줄바꿈·쉼표·세미콜론으로 구분해 여러 명을 입력할 수 있습니다. 중복과 잘못된 주소는 자동으로 걸러집니다.
                                    </p>
                                </div>

                                {/* 처리 결과 */}
                                {inviteSummary && (
                                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                                        <div className="flex items-center gap-4 text-xs">
                                            <span className="text-emerald-300">초대 {inviteSummary.invited}명</span>
                                            <span className="text-amber-300">건너뜀 {inviteSummary.skipped}명</span>
                                            {inviteSummary.failed > 0 && (
                                                <span className="text-red-300">실패 {inviteSummary.failed}명</span>
                                            )}
                                        </div>
                                        {inviteResults && inviteResults.length > 0 && (
                                            <div className="mt-3 max-h-[160px] overflow-auto space-y-1">
                                                {inviteResults.map((result, index) => (
                                                    <div key={index} className="flex items-center gap-2 text-[11px]">
                                                        <span className={
                                                            result.status === 'invited' ? 'text-emerald-400'
                                                                : result.status === 'skipped' ? 'text-amber-400'
                                                                    : 'text-red-400'
                                                        }>
                                                            {result.status === 'invited' ? '●' : result.status === 'skipped' ? '○' : '×'}
                                                        </span>
                                                        <span className="text-gray-300">{result.email}</span>
                                                        {result.reason && <span className="text-gray-600">— {result.reason}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={closeInviteModal} className="flex-1 btn-secondary py-3">
                                        닫기
                                    </button>
                                    <button type="submit" disabled={isInviting} className="flex-1 btn-primary py-3 disabled:opacity-50">
                                        {isInviting ? '발송 중...' : '일괄 초대 보내기'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
