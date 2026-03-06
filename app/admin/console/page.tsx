'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AdminStats {
    totalProjects: number;
    totalUsers: number;
    totalRequirements: number;
    totalResponses: number;
    recentProjects: Array<{
        id: string;
        name: string;
        createdAt: string;
    }>;
    kanoDistribution: {
        M: number;
        O: number;
        A: number;
        I: number;
        R: number;
        Q: number;
    };
}

export default function AdminConsolePage() {
    const router = useRouter();
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const response = await fetch('/api/admin/stats');
            if (response.ok) {
                const data = await response.json();
                setStats(data);
            } else if (response.status === 403) {
                alert('관리자 권한이 필요합니다.');
                router.push('/dashboard');
            }
        } catch (error) {
            console.error('통계 로드 실패:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const getCategoryMeta = (cat: string) => {
        const map: Record<string, { label: string; color: string; bg: string }> = {
            M: { label: 'Must-be', color: 'text-rose-400', bg: 'bg-rose-500/20 border-rose-500/30' },
            O: { label: 'One-Dim', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30' },
            A: { label: 'Attractive', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' },
            I: { label: 'Indifferent', color: 'text-gray-400', bg: 'bg-gray-500/20 border-gray-500/30' },
            R: { label: 'Reverse', color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-500/30' },
            Q: { label: 'Question', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
        };
        return map[cat] || { label: cat, color: 'text-gray-400', bg: 'bg-gray-500/20 border-gray-500/30' };
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-surface-900 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <svg className="animate-spin h-8 w-8 text-primary-400" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="text-gray-500 text-sm">통계를 불러오는 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative">
            <div className="bg-orb w-[400px] h-[400px] bg-primary-600/50 top-[-200px] left-[10%] opacity-10" />

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
                                <h1 className="text-xl font-display font-bold text-white">관리자 콘솔</h1>
                                <p className="text-xs text-gray-500 mt-0.5">시스템 전체 통계 및 분석</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            업데이트: {new Date().toLocaleString('ko-KR')}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main */}
            <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 page-enter">
                <div className="space-y-6">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: '총 프로젝트', value: stats?.totalProjects || 0, unit: '개', gradient: 'from-blue-500/20 to-cyan-500/20', icon: <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg> },
                            { label: '총 사용자', value: stats?.totalUsers || 0, unit: '명', gradient: 'from-emerald-500/20 to-teal-500/20', icon: <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> },
                            { label: '총 요구사항', value: stats?.totalRequirements || 0, unit: '개', gradient: 'from-purple-500/20 to-pink-500/20', icon: <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
                            { label: '총 설문 응답', value: stats?.totalResponses || 0, unit: '개', gradient: 'from-amber-500/20 to-orange-500/20', icon: <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg> },
                        ].map((stat) => (
                            <div key={stat.label} className="stat-card">
                                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center mx-auto mb-3`}>
                                    {stat.icon}
                                </div>
                                <div className="text-2xl font-display font-bold text-white">
                                    {stat.value}<span className="text-sm text-gray-500 ml-1">{stat.unit}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Kano Distribution */}
                    <div className="card">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center">
                                <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            </div>
                            <h2 className="text-lg font-display font-bold text-white">Kano 카테고리 분포</h2>
                        </div>

                        {stats && stats.kanoDistribution ? (
                            <>
                                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
                                    {Object.entries(stats.kanoDistribution).map(([cat, count]) => {
                                        const meta = getCategoryMeta(cat);
                                        return (
                                            <div key={cat} className={`rounded-xl border p-4 text-center ${meta.bg}`}>
                                                <div className={`text-2xl font-display font-bold ${meta.color}`}>{count}</div>
                                                <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">{cat} · {meta.label}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="bg-primary-500/5 border border-primary-500/10 rounded-xl p-4">
                                    <p className="text-xs text-gray-400 leading-relaxed">
                                        <span className="text-primary-400 font-semibold">분석: </span>
                                        전체 {Object.values(stats.kanoDistribution).reduce((a, b) => a + b, 0)}개의 응답이 수집되었습니다.
                                    </p>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                                    <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                </div>
                                <p className="text-gray-500 text-sm">아직 Kano 응답이 없습니다</p>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Recent Projects */}
                        <div className="card">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                </div>
                                <h2 className="text-lg font-display font-bold text-white">최근 프로젝트</h2>
                            </div>
                            {stats && stats.recentProjects.length > 0 ? (
                                <div className="space-y-2">
                                    {stats.recentProjects.map((project) => (
                                        <Link
                                            key={project.id}
                                            href={`/project/${project.id}`}
                                            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-200"
                                        >
                                            <div>
                                                <p className="text-sm font-medium text-white">{project.name}</p>
                                                <p className="text-[10px] text-gray-600 mt-1">{new Date(project.createdAt).toLocaleDateString('ko-KR')}</p>
                                            </div>
                                            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-center py-8 text-sm">프로젝트가 없습니다</p>
                            )}
                        </div>

                        {/* System Info */}
                        <div className="card">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-500/20 to-gray-400/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>
                                </div>
                                <h2 className="text-lg font-display font-bold text-white">시스템 정보</h2>
                            </div>
                            <div className="space-y-3">
                                {[
                                    { label: '데이터베이스', value: '메모리 저장소 (임시)', status: 'badge-amber' },
                                    { label: '버전', value: 'v1.0.0-beta', status: 'badge-primary' },
                                    { label: '환경', value: '개발 모드', status: 'badge-purple' },
                                    { label: '상태', value: '정상 작동', status: 'badge-emerald' },
                                ].map((info) => (
                                    <div key={info.label} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                        <span className="text-xs text-gray-500">{info.label}</span>
                                        <span className={info.status + ' text-[10px]'}>{info.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
