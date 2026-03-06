'use client';

import { useState, useEffect } from 'react';
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
import { useRouter } from 'next/navigation';

interface ProjectData {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    memberCount: number;
    role: string;
}

export default function ProjectDetailPage() {
    const params = useParams();
    const projectId = params.id as string;
    const [activeTab, setActiveTab] = useState('overview');
    const [project, setProject] = useState<ProjectData | null>(null);
    const [reqCount, setReqCount] = useState(0);
    const [kanoCount, setKanoCount] = useState(0);
    const [specCount, setSpecCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

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

                // 요구사항 수
                const reqRes = await fetch(`/api/projects/${projectId}/requirements`);
                if (reqRes.ok) {
                    const reqData = await reqRes.json();
                    setReqCount(reqData.requirements?.length || 0);
                }

                // Kano 응답 수
                const kanoRes = await fetch(`/api/projects/${projectId}/kano/analysis`);
                if (kanoRes.ok) {
                    const kanoData = await kanoRes.json();
                    setKanoCount(kanoData.totalResponses || 0);
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

    const iconSvg = (d: string) => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={d} /></svg>;

    const tabs = [
        { id: 'overview', name: '개요', icon: iconSvg('M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z') },
        { id: 'sales', name: '매출추정', icon: iconSvg('M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z') },
        { id: 'spec', name: 'AS-IS 스펙', icon: iconSvg('M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z') },
        { id: 'attributes', name: '제품속성서', icon: iconSvg('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
        { id: 'fitness', name: '적합도', icon: iconSvg('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z') },
        { id: 'requirements', name: '요구사항', icon: iconSvg('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2') },
        { id: 'kano', name: 'Kano 설문', icon: iconSvg('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z') },
        { id: 'qfd', name: 'QFD', icon: iconSvg('M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1') },
        { id: 'tech-tree', name: '기능기술체계', icon: iconSvg('M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z') },
        { id: 'improvements', name: '개선포인트', icon: iconSvg('M13 10V3L4 14h7v7l9-11h-7z') },
        { id: 'target-spec', name: '목표사양', icon: iconSvg('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z') },
        { id: 'tech-roadmap', name: '기술로드맵', icon: iconSvg('M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7') },
        { id: 'dev-plan', name: '개발계획', icon: iconSvg('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z') },
        { id: 'import', name: '가져오기', icon: iconSvg('M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4') },
        { id: 'settings', name: '설정', icon: iconSvg('M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z') },
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
        spec: <SpecTable projectId={projectId} />,
        requirements: <RequirementsTable projectId={projectId} />,
        qfd: <QFDMatrix projectId={projectId} />,
        kano: <KanoManager projectId={projectId} />,
        sales: <SalesTable projectId={projectId} />,
        fitness: <FitnessWrapper projectId={projectId} />,
        improvements: <ImprovementsTable projectId={projectId} />,
        'target-spec': <TargetSpecTable projectId={projectId} />,
        'tech-roadmap': <TechRoadmapTable projectId={projectId} />,
        'dev-plan': <DevPlanTable projectId={projectId} />,
        'tech-tree': <TechTreeTable projectId={projectId} />,
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

    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative">
            <div className="bg-orb w-[400px] h-[400px] bg-primary-600/50 top-[-200px] right-[10%] opacity-10" />

            {/* Header */}
            <header className="relative z-10 glass border-b border-white/[0.06] rounded-none">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
                        </div>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="relative z-10 border-b border-white/[0.06] bg-surface-900/80 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
            <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 page-enter">
                {activeTab === 'overview' && (
                    <div className="space-y-8 animate-fade-in">
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
