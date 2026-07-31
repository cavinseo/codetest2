'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ProductAttributesTable from '@/components/project/ProductAttributesTable';
import SpecTable from '@/components/project/SpecTable';
import RequirementsTable from '@/components/project/RequirementsTable';
import QFDMatrix from '@/components/project/QFDMatrix';
import KanoManager from '@/components/project/KanoManager';
import SalesTable from '@/components/project/SalesTable';
import FitnessWrapper from '@/components/project/FitnessWrapper';
import ImprovementsTable from '@/components/project/ImprovementsTable';
import TargetSpecTable from '@/components/project/TargetSpecTable';
import TechRoadmapTable from '@/components/project/TechRoadmapTable';
import DevPlanTable from '@/components/project/DevPlanTable';
import TechTreeTable from '@/components/project/TechTreeTable';
import AssetsTable from '@/components/project/AssetsTable';
import FundingTable from '@/components/project/FundingTable';
import KanoSatisfactionGraph from '@/components/project/KanoSatisfactionGraph';
import KanoAggregationTable from '@/components/project/KanoAggregationTable';
import {
    getBusinessPlanFileValidationError,
    parseBusinessPlanFile,
    readAndSerializeBusinessPlanFile,
} from '@/lib/business-plan-file';
import { useRouter } from 'next/navigation';

interface ProjectData {
    id: string;
    name: string;
    description?: string;
    detailedDescription?: string;
    businessPlanFile?: string;
    createdAt: string;
    memberCount: number;
    role: string;
}

interface WorksheetCompletenessItem {
    key: string;
    title: string;
    required: boolean;
    status: 'EMPTY' | 'IN_PROGRESS' | 'COMPLETE';
    percent: number;
    worksheetKey: string;
    nextStep: string;
}

interface WorksheetCompleteness {
    status: 'IN_PROGRESS' | 'REPORT_READY';
    percent: number;
    requiredComplete: boolean;
    completedRequired: number;
    totalRequired: number;
    items: WorksheetCompletenessItem[];
    blockers: WorksheetCompletenessItem[];
    nextAction: WorksheetCompletenessItem | null;
}

export default function ProjectDetailPage() {
    const params = useParams();
    const projectId = params.id as string;
    const [activeTab, setActiveTab] = useState('overview');
    const [project, setProject] = useState<ProjectData | null>(null);
    const [reqCount, setReqCount] = useState(0);
    const [kanoCount, setKanoCount] = useState(0);
    const [specCount, setSpecCount] = useState(0);
    const [kanoAnalysis, setKanoAnalysis] = useState<any>(null);
    const [kanoRequirements, setKanoRequirements] = useState<any[]>([]);
    const [worksheetCompleteness, setWorksheetCompleteness] = useState<WorksheetCompleteness | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOverviewEditing, setIsOverviewEditing] = useState(false);
    const [isOverviewSaving, setIsOverviewSaving] = useState(false);
    const [isOverviewFileReading, setIsOverviewFileReading] = useState(false);
    const [isOverviewFileDirty, setIsOverviewFileDirty] = useState(false);
    const [overviewError, setOverviewError] = useState('');
    const overviewFileSelectionRef = useRef(0);
    const [overviewForm, setOverviewForm] = useState({
        name: '',
        description: '',
        detailedDescription: '',
        businessPlanFile: '',
    });

    useEffect(() => {
        async function loadData() {
            try {
                // 프로젝트 목록에서 현재 프로젝트 찾기
                const projRes = await fetch('/api/projects');
                if (projRes.ok) {
                    const projData = await projRes.json();
                    const found = projData.projects?.find((p: any) => p.id === projectId);
                    if (found) setProject(found);
                    else setProject({ id: projectId, name: '프로젝트', description: '', createdAt: new Date().toISOString(), memberCount: 1, role: 'OWNER' });
                }

                const overviewRes = await fetch(`/api/projects/${projectId}/overview`);
                if (overviewRes.ok) {
                    const overviewData = await overviewRes.json();
                    setWorksheetCompleteness(overviewData.worksheetCompleteness || null);
                    if (overviewData.project) {
                        setProject((current) => ({
                            id: overviewData.project.id,
                            name: overviewData.project.name,
                            description: overviewData.project.description || '',
                            detailedDescription: overviewData.project.detailedDescription || '',
                            businessPlanFile: overviewData.project.businessPlanFile || '',
                            createdAt: overviewData.project.createdAt,
                            memberCount: current?.memberCount ?? 1,
                            role: overviewData.project.role || current?.role || 'COACH',
                        }));
                    }
                }

                // 요구사항 수
                const reqRes = await fetch(`/api/projects/${projectId}/requirements`);
                if (reqRes.ok) {
                    const reqData = await reqRes.json();
                    setReqCount(reqData.requirements?.length || 0);
                }

                // Kano 분석 데이터
                const kanoAnalysisRes = await fetch(`/api/projects/${projectId}/kano/analysis`);
                if (kanoAnalysisRes.ok) {
                    const kanoAnalysisData = await kanoAnalysisRes.json();
                    setKanoAnalysis(kanoAnalysisData);
                    setKanoCount(kanoAnalysisData.totalResponses || 0);

                    // Kano 요구사항 명칭을 위해 요구사항 목록도 가져옴
                    const kanoReqRes = await fetch(`/api/projects/${projectId}/requirements`);
                    if (kanoReqRes.ok) {
                        const kanoReqData = await kanoReqRes.json();
                        setKanoRequirements(kanoReqData.requirements || []);
                    }
                }

                // 스펙 수
                const specRes = await fetch(`/api/projects/${projectId}/spec`);
                if (specRes.ok) {
                    const specData = await specRes.json();
                    setSpecCount(specData.specFunctions?.length || 0);
                }
            } catch (error) {
                console.error('데이터 로딩 실패:', error);
                setProject({ id: projectId, name: '프로젝트', description: '', createdAt: new Date().toISOString(), memberCount: 1, role: 'OWNER' });
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, [projectId]);

    useEffect(() => {
        if (!project) return;
        setOverviewForm({
            name: project.name || '',
            description: project.description || '',
            detailedDescription: project.detailedDescription || '',
            businessPlanFile: project.businessPlanFile || '',
        });
        setIsOverviewFileDirty(false);
    }, [project]);

    const projectBusinessPlanFile = useMemo(
        () => parseBusinessPlanFile(project?.businessPlanFile),
        [project?.businessPlanFile]
    );
    const formBusinessPlanFile = useMemo(
        () => parseBusinessPlanFile(overviewForm.businessPlanFile),
        [overviewForm.businessPlanFile]
    );

    const handleOverviewCancel = () => {
        if (!project) return;
        overviewFileSelectionRef.current += 1;
        setIsOverviewFileReading(false);
        setIsOverviewFileDirty(false);
        setOverviewForm({
            name: project.name || '',
            description: project.description || '',
            detailedDescription: project.detailedDescription || '',
            businessPlanFile: project.businessPlanFile || '',
        });
        setOverviewError('');
        setIsOverviewEditing(false);
    };

    const handleOverviewFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        const validationError = getBusinessPlanFileValidationError(file);
        if (validationError) {
            setOverviewError(validationError);
            return;
        }

        const selectionVersion = ++overviewFileSelectionRef.current;
        setOverviewError('');
        setIsOverviewFileReading(true);
        try {
            const businessPlanFile = await readAndSerializeBusinessPlanFile(file);
            if (selectionVersion !== overviewFileSelectionRef.current) return;
            setOverviewForm((current) => ({ ...current, businessPlanFile }));
            setIsOverviewFileDirty(true);
        } catch (error) {
            if (selectionVersion !== overviewFileSelectionRef.current) return;
            setOverviewError(error instanceof Error ? error.message : '사업계획 파일을 읽지 못했습니다.');
        } finally {
            if (selectionVersion === overviewFileSelectionRef.current) setIsOverviewFileReading(false);
        }
    };

    const handleOverviewFileRemove = () => {
        overviewFileSelectionRef.current += 1;
        setIsOverviewFileReading(false);
        setIsOverviewFileDirty(true);
        setOverviewError('');
        setOverviewForm((current) => ({ ...current, businessPlanFile: '' }));
    };

    const handleOverviewSave = async () => {
        if (!project) return;
        setOverviewError('');
        if (!overviewForm.name.trim()) {
            setOverviewError('프로젝트명을 입력하세요.');
            return;
        }

        setIsOverviewSaving(true);
        try {
            const payload = {
                name: overviewForm.name,
                description: overviewForm.description,
                detailedDescription: overviewForm.detailedDescription,
                ...(isOverviewFileDirty ? { businessPlanFile: overviewForm.businessPlanFile } : {}),
            };
            const res = await fetch(`/api/projects/${projectId}/overview`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || '제품개요 저장에 실패했습니다.');
            }

            setProject({
                ...project,
                name: data.project.name,
                description: data.project.description || '',
                detailedDescription: data.project.detailedDescription || '',
                businessPlanFile: isOverviewFileDirty ? overviewForm.businessPlanFile : project.businessPlanFile || '',
            });
            setIsOverviewFileDirty(false);
            setIsOverviewEditing(false);
        } catch (error) {
            setOverviewError(error instanceof Error ? error.message : '제품개요 저장에 실패했습니다.');
        } finally {
            setIsOverviewSaving(false);
        }
    };

    const iconSvg = (d: string) => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={d} /></svg>;

    const tabs = [
        { id: 'overview', name: '개요', icon: iconSvg('M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z') },
        { id: 'sales', name: '[WS-1] 자사매출추정표', icon: iconSvg('M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z') },
        { id: 'spec', name: '[WS-2] AS-IS 스펙표', icon: iconSvg('M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z') },
        { id: 'attributes', name: '[WS-3] 제품속성서', icon: iconSvg('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
        { id: 'fitness', name: '[WS-4] 제품속성적합도', icon: iconSvg('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z') },
        { id: 'requirements', name: '[WS-5] 고객요구사항도출표', icon: iconSvg('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2') },
        { id: 'kano', name: '[WS-6] KANO 질문지', icon: iconSvg('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z') },
        { id: 'kano-aggregation', name: '[WS-7] TIMKO/만족계수 그래프', icon: iconSvg('M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10') },
        { id: 'qfd', name: '[WS-9] QFD', icon: iconSvg('M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1') },
        { id: 'tech-tree', name: '[WS-10] 기능기술체계도', icon: iconSvg('M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z') },
        { id: 'improvements', name: '[WS-11] 개선포인트도출', icon: iconSvg('M13 10V3L4 14h7v7l9-11h-7z') },
        { id: 'target-spec', name: '[WS-12] 최종목표스펙도출', icon: iconSvg('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z') },
        { id: 'tech-roadmap', name: '[WS-13] 향후목표고객LIST', icon: iconSvg('M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7') },
        { id: 'dev-plan', name: '[WS-14] 개발계획서', icon: iconSvg('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z') },
        { id: 'assets', name: '[WS-15] 핵심자산 및 보완자산 도출표', icon: iconSvg('M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4') },
        { id: 'funding-plan', name: '[WS-16] 자금소요계획표', icon: iconSvg('M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z') },
        { id: 'funding-source', name: '[WS-17] 자금조달계획표', icon: iconSvg('M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v-1') },
        { id: 'import', name: '가져오기', icon: iconSvg('M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4') },
    ];

    const quickStartSteps = [
        {
            step: 1,
            title: '엑셀 파일 가져오기',
            desc: '기존 엑셀 파일의 데이터를 자동으로 가져옵니다',
            tab: 'import',
            active: true,
            gradient: 'from-blue-500/20 to-cyan-500/20',
        },
        {
            step: 2,
            title: 'AS-IS 스펙표 작성',
            desc: 'FAST 분석 기반으로 제품/서비스 기능을 구조화합니다',
            tab: 'spec',
            active: true,
            gradient: 'from-cyan-500/20 to-blue-500/20',
        },
        {
            step: 3,
            title: '제품 속성 정의',
            desc: '제품의 주요 속성과 목표값을 정의합니다',
            tab: 'attributes',
            active: true,
            gradient: 'from-blue-500/20 to-purple-500/20',
        },
        {
            step: 4,
            title: '속성 적합도 분석',
            desc: '각 속성의 중요도와 현재/목표 수준을 분석합니다',
            tab: 'fitness',
            active: true,
            gradient: 'from-purple-500/20 to-pink-500/20',
        },
        {
            step: 5,
            title: '고객 요구사항 입력',
            desc: '제품의 고객 요구사항을 카테고리별로 정리합니다',
            tab: 'requirements',
            active: true,
            gradient: 'from-pink-500/20 to-rose-500/20',
        },
        {
            step: 6,
            title: 'Kano 설문 생성',
            desc: '요구사항을 기반으로 Kano 설문을 자동 생성합니다',
            tab: 'kano',
            active: true,
            gradient: 'from-rose-500/20 to-orange-500/20',
        },
    ];

    const router = useRouter();

    const tabComponents: Record<string, React.ReactNode> = {
        attributes: <ProductAttributesTable projectId={projectId} />,
        spec: <SpecTable projectId={projectId} onSaved={() => setActiveTab('attributes')} />,
        requirements: <RequirementsTable projectId={projectId} />,
        qfd: <QFDMatrix projectId={projectId} />,
        kano: <KanoManager projectId={projectId} />,
        sales: <SalesTable projectId={projectId} onSaved={() => setActiveTab('spec')} />,
        fitness: <FitnessWrapper projectId={projectId} />,
        improvements: <ImprovementsTable projectId={projectId} />,
        'target-spec': <TargetSpecTable projectId={projectId} />,
        'tech-roadmap': <TechRoadmapTable projectId={projectId} />,
        'dev-plan': <DevPlanTable projectId={projectId} />,
        'tech-tree': <TechTreeTable projectId={projectId} />,
        'assets': <AssetsTable projectId={projectId} />,
        'funding-plan': <FundingTable projectId={projectId} mode="plan" />,
        'funding-source': <FundingTable projectId={projectId} mode="source" />,
        'kano-aggregation': kanoAnalysis ? (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-display font-bold text-white">TIMKO/만족계수 그래프</h2>
                </div>
                {(() => {
                    const analysis = kanoAnalysis.requirements.map((r: any) => ({
                        ...r,
                        requirementName: kanoRequirements.find((req: any) => req.id === r.requirementId)?.requirement
                    }));

                    return (
                        <>
                            <KanoSatisfactionGraph analysis={analysis} />
                            <KanoAggregationTable
                                projectId={projectId}
                                onWeightsSaved={async () => {
                                    const res = await fetch(`/api/projects/${projectId}/kano/analysis`);
                                    if (res.ok) setKanoAnalysis(await res.json());
                                }}
                                analysis={analysis}
                            />
                        </>
                    );
                })()}
            </div>
        ) : (
            <div className="card text-center py-20 text-gray-500">Kano 분석 데이터가 없습니다.</div>
        ),
    };

    const renderTabContent = (tabId: string) => {
        if (tabComponents[tabId]) {
            return (
                <div className="animate-fade-in">
                    {tabComponents[tabId]}
                </div>
            );
        }

        const tabMeta: Record<string, { icon: React.ReactNode; title: string; desc: string; link: string; linkText: string }> = {
            import: {
                icon: <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
                title: '엑셀 파일 가져오기',
                desc: '전용 페이지에서 파일을 업로드하고 마이그레이션을 진행하세요',
                link: `/project/${projectId}/import`,
                linkText: '업로드 페이지로 이동',
            },
            settings: {
                icon: <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
                title: '프로젝트 설정',
                desc: '프로젝트를 설정하고 팀원을 관리하세요',
                link: `/project/${projectId}/settings`,
                linkText: '설정 페이지로 이동',
            },
        };

        const meta = tabMeta[tabId];
        if (!meta) return null;

        return (
            <div className="card max-w-lg mx-auto text-center py-16 animate-fade-in">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-6">
                    {meta.icon}
                </div>
                <h2 className="text-2xl font-display font-bold text-white mb-3">{meta.title}</h2>
                <p className="text-gray-400 mb-8 text-sm">{meta.desc}</p>
                <Link href={meta.link} className="btn-primary inline-flex items-center gap-2">
                    {meta.linkText}
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </Link>
            </div>
        );
    };

    if (isLoading || !project) {
        return (
            <div className="min-h-screen bg-surface-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-gray-400">프로젝트 로딩 중...</p>
                </div>
            </div>
        );
    }

    const canEditOverview = ['OWNER', 'EDITOR', 'ADMIN'].includes(project.role);
    const displayedBusinessPlanFile = isOverviewEditing ? formBusinessPlanFile : projectBusinessPlanFile;

    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative">
            <div className="bg-orb w-[400px] h-[400px] bg-primary-600/50 top-[-200px] right-[10%] opacity-10" />

            {/* Header */}
            <header className="relative z-10 glass border-b border-white/[0.06] rounded-none">
                <div className="mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-4 lg:px-6 2xl:px-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href="/dashboard" className="btn-ghost text-sm flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                대시보드
                            </Link>
                            <div className="w-px h-6 bg-white/10" />
                            <div>
                                <h1 className="text-xl font-display font-bold text-white">{project.name}</h1>
                                <p className="text-xs text-gray-500 mt-0.5">{project.description}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Link href={`/project/${projectId}/settings`} className="btn-secondary text-sm">
                                팀원 초대
                            </Link>
                            <Link href={`/project/${projectId}/settings`} className="btn-secondary text-sm">
                                설정
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="relative z-10 border-b border-white/[0.06] bg-surface-900/80 backdrop-blur-sm">
                <div className="mx-auto w-full max-w-[1800px] px-3 sm:px-4 lg:px-6 2xl:px-8">
                    <nav className="flex gap-1 py-2 overflow-x-auto">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={activeTab === tab.id ? 'nav-tab-active' : 'nav-tab'}
                            >
                                <span className="flex items-center gap-2">
                                    {tab.icon}
                                    {tab.name}
                                </span>
                            </button>
                        ))}
                    </nav>
                </div>
            </div>

            {/* Main Content */}
            <main className="relative z-10 mx-auto w-full max-w-[1800px] px-3 py-8 sm:px-4 lg:px-6 2xl:px-8 page-enter">
                {activeTab === 'overview' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="card">
                            <div className="flex items-start justify-between gap-4 mb-6">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-primary-300 mb-2">Product Overview</p>
                                    <h2 className="text-xl font-display font-bold text-white">제품개요</h2>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isOverviewEditing ? (
                                        <>
                                            <button type="button" onClick={handleOverviewCancel} disabled={isOverviewSaving} className="btn-secondary text-xs">취소</button>
                                            <button type="button" onClick={handleOverviewSave} disabled={isOverviewSaving || isOverviewFileReading} className="btn-primary text-xs">
                                                {isOverviewSaving ? '저장 중...' : isOverviewFileReading ? '파일 읽는 중...' : '저장'}
                                            </button>
                                        </>
                                    ) : (
                                        canEditOverview && (
                                            <button type="button" onClick={() => { setOverviewError(''); setIsOverviewEditing(true); }} className="btn-secondary text-xs">수정</button>
                                        )
                                    )}
                                </div>
                            </div>

                            {overviewError && (
                                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                    {overviewError}
                                </div>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
                                    <p className="text-xs text-gray-500 mb-2">프로젝트명</p>
                                    {isOverviewEditing ? (
                                        <input
                                            type="text"
                                            value={overviewForm.name}
                                            onChange={(event) => setOverviewForm({ ...overviewForm, name: event.target.value })}
                                            className="w-full rounded-md border border-white/[0.08] bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-primary-500"
                                        />
                                    ) : (
                                        <p className="text-sm font-semibold text-white whitespace-pre-wrap">{project.name}</p>
                                    )}
                                </div>
                                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
                                    <p className="text-xs text-gray-500 mb-2">사업계획 파일</p>
                                    {isOverviewEditing ? (
                                        <div className="space-y-3">
                                            <div className="min-w-0 text-sm text-white">
                                                {displayedBusinessPlanFile ? (
                                                    displayedBusinessPlanFile.dataUrl ? (
                                                        <a
                                                            href={displayedBusinessPlanFile.dataUrl}
                                                            download={displayedBusinessPlanFile.fileName}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-primary-300 hover:text-primary-200 underline break-all"
                                                        >
                                                            {displayedBusinessPlanFile.fileName} 열기
                                                        </a>
                                                    ) : (
                                                        <span className="break-all">{displayedBusinessPlanFile.displayValue}</span>
                                                    )
                                                ) : (
                                                    <span className="text-gray-500">등록된 파일 없음</span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <label className="btn-secondary cursor-pointer text-xs">
                                                    {displayedBusinessPlanFile ? '파일 교체' : '파일 선택'}
                                                    <input
                                                        type="file"
                                                        accept=".pdf,.doc,.docx,.txt"
                                                        className="hidden"
                                                        onChange={handleOverviewFileSelect}
                                                        disabled={isOverviewSaving || isOverviewFileReading}
                                                    />
                                                </label>
                                                {displayedBusinessPlanFile && (
                                                    <button
                                                        type="button"
                                                        onClick={handleOverviewFileRemove}
                                                        disabled={isOverviewSaving}
                                                        className="text-xs text-rose-300 hover:text-rose-200 disabled:opacity-50"
                                                    >
                                                        삭제
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500">PDF, DOC, DOCX, TXT · 최대 10MB</p>
                                        </div>
                                    ) : (
                                        displayedBusinessPlanFile ? (
                                            displayedBusinessPlanFile.dataUrl ? (
                                                <a
                                                    href={displayedBusinessPlanFile.dataUrl}
                                                    download={displayedBusinessPlanFile.fileName}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-primary-300 hover:text-primary-200 underline break-all"
                                                >
                                                    {displayedBusinessPlanFile.fileName} 열기
                                                </a>
                                            ) : (
                                                <p className="text-sm text-white break-all">{displayedBusinessPlanFile.displayValue}</p>
                                            )
                                        ) : (
                                            <p className="text-sm text-gray-500">등록된 파일 없음</p>
                                        )
                                    )}
                                </div>
                                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 lg:col-span-2">
                                    <p className="text-xs text-gray-500 mb-2">간단 설명</p>
                                    {isOverviewEditing ? (
                                        <textarea
                                            value={overviewForm.description}
                                            onChange={(event) => setOverviewForm({ ...overviewForm, description: event.target.value })}
                                            rows={3}
                                            className="w-full resize-y rounded-md border border-white/[0.08] bg-gray-950 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-primary-500"
                                        />
                                    ) : (
                                        <p className="text-sm leading-6 text-white whitespace-pre-wrap">{project.description || '입력된 간단 설명이 없습니다.'}</p>
                                    )}
                                </div>
                                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 lg:col-span-2">
                                    <p className="text-xs text-gray-500 mb-2">상세 제품개요</p>
                                    {isOverviewEditing ? (
                                        <textarea
                                            value={overviewForm.detailedDescription}
                                            onChange={(event) => setOverviewForm({ ...overviewForm, detailedDescription: event.target.value })}
                                            rows={7}
                                            className="w-full resize-y rounded-md border border-white/[0.08] bg-gray-950 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-primary-500"
                                        />
                                    ) : (
                                        <p className="text-sm leading-6 text-white whitespace-pre-wrap">{project.detailedDescription || '입력된 상세 제품개요가 없습니다.'}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {worksheetCompleteness && (
                            <div className="card">
                                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-primary-300 mb-2">Worksheet Readiness</p>
                                        <h2 className="text-xl font-display font-bold text-white">
                                            {worksheetCompleteness.status === 'REPORT_READY' ? '보고서 초안 생성 준비 완료' : '워크시트 완성도'}
                                        </h2>
                                        <p className="text-sm text-gray-400 mt-2">
                                            필수 워크시트 {worksheetCompleteness.completedRequired}/{worksheetCompleteness.totalRequired}개 완료
                                        </p>
                                    </div>
                                    <div className="min-w-[180px]">
                                        <div className="flex items-end justify-between mb-2">
                                            <span className="text-3xl font-display font-bold text-white">{worksheetCompleteness.percent}%</span>
                                            <span className={`text-xs font-semibold px-2 py-1 rounded ${worksheetCompleteness.requiredComplete ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                                                {worksheetCompleteness.requiredComplete ? 'READY' : 'IN PROGRESS'}
                                            </span>
                                        </div>
                                        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                            <div className="h-full rounded-full bg-primary-500" style={{ width: `${worksheetCompleteness.percent}%` }} />
                                        </div>
                                    </div>
                                </div>

                                {worksheetCompleteness.nextAction && (
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab(worksheetCompleteness.nextAction?.worksheetKey || 'overview')}
                                        className="mt-5 w-full text-left rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors"
                                    >
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">다음 작업</p>
                                                <p className="text-sm font-semibold text-white">{worksheetCompleteness.nextAction.title}</p>
                                                <p className="text-xs text-gray-400 mt-1">{worksheetCompleteness.nextAction.nextStep}</p>
                                            </div>
                                            <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </button>
                                )}

                                {worksheetCompleteness.blockers.length > 0 && (
                                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {worksheetCompleteness.blockers.slice(0, 6).map((item) => (
                                            <button
                                                key={item.key}
                                                type="button"
                                                onClick={() => setActiveTab(item.worksheetKey)}
                                                className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3 text-left hover:bg-amber-500/[0.08] transition-colors"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-sm font-semibold text-amber-200">{item.title}</span>
                                                    <span className="text-xs text-amber-300">{item.percent}%</span>
                                                </div>
                                                <p className="text-xs text-amber-100/70 mt-2">{item.nextStep}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="hidden">
                            <div className="flex items-start justify-between gap-4 mb-6">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-primary-300 mb-2">Product Overview</p>
                                    <h2 className="text-xl font-display font-bold text-white">제품개요</h2>
                                </div>
                                <span className="badge-primary text-[10px]">프로젝트 생성 정보</span>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
                                    <p className="text-xs text-gray-500 mb-2">프로젝트명</p>
                                    <p className="text-sm font-semibold text-white whitespace-pre-wrap">{project.name}</p>
                                </div>
                                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
                                    <p className="text-xs text-gray-500 mb-2">사업계획 파일</p>
                                    <p className="text-sm text-white break-all">
                                        {projectBusinessPlanFile?.displayValue || '등록된 파일 없음'}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 lg:col-span-2">
                                    <p className="text-xs text-gray-500 mb-2">간단 설명</p>
                                    <p className="text-sm leading-6 text-white whitespace-pre-wrap">
                                        {project.description || '입력된 간단 설명이 없습니다.'}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 lg:col-span-2">
                                    <p className="text-xs text-gray-500 mb-2">상세 제품개요</p>
                                    <p className="text-sm leading-6 text-white whitespace-pre-wrap">
                                        {project.detailedDescription || '입력된 상세 제품개요가 없습니다.'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            {[
                                { label: 'AS-IS 스펙', value: `${specCount}개`, sub: specCount > 0 ? '기능 분해 완료' : '아직 작성되지 않음', gradient: 'from-cyan-500/20 to-blue-500/20', icon: <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg> },
                                { label: '고객 요구사항', value: `${reqCount}개`, sub: reqCount > 0 ? '입력 완료' : '아직 입력되지 않음', gradient: 'from-blue-500/20 to-cyan-500/20', icon: <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
                                { label: 'Kano 응답', value: `${kanoCount}개`, sub: kanoCount > 0 ? '응답 수집됨' : '설문 응답 대기 중', gradient: 'from-purple-500/20 to-pink-500/20', icon: <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
                                { label: '팀원', value: `${project.memberCount}명`, sub: '협업 중', gradient: 'from-emerald-500/20 to-teal-500/20', icon: <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
                            ].map((stat) => (
                                <div key={stat.label} className="stat-card flex items-start gap-4 text-left">
                                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center flex-shrink-0`}>
                                        {stat.icon}
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
                                        <p className="text-2xl font-display font-bold text-white">{stat.value}</p>
                                        <p className="text-xs text-gray-500 mt-1">{stat.sub}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Quick Start */}
                        <div className="card">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                </div>
                                <h2 className="text-xl font-display font-bold text-white">빠른 시작</h2>
                            </div>
                            <div className="space-y-3">
                                {quickStartSteps.map((item) => (
                                    <div
                                        key={item.step}
                                        className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 ${item.active
                                            ? 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] cursor-pointer'
                                            : 'bg-white/[0.01] border-white/[0.04] opacity-50'
                                            }`}
                                        onClick={() => item.active && setActiveTab(item.tab)}
                                    >
                                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center text-sm font-bold text-white flex-shrink-0`}>
                                            {item.step}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                                            <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                                        </div>
                                        {item.active ? (
                                            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        ) : (
                                            <span className="badge-primary text-[10px]">대기</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab !== 'overview' && renderTabContent(activeTab)}
            </main>
        </div>
    );
}
