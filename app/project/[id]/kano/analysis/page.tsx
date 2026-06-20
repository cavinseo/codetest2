'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function KanoAnalysisPage() {
    const params = useParams();
    const projectId = params.id as string;

    return (
        <div className="min-h-screen bg-gray-900">
            {/* 헤더 */}
            <header className="bg-gray-800 border-b border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href={`/project/${projectId}`} className="text-gray-400 hover:text-white transition-colors flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                프로젝트 홈
                            </Link>
                            <div className="w-px h-6 bg-gray-700" />
                            <div>
                                <h1 className="text-xl font-display font-bold text-white">[WS-7] Kano 분석 집계표</h1>
                                <p className="text-xs text-gray-500 mt-0.5">분석 결과는 WS-7에서 확인합니다</p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="card text-center py-14">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                        <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h2 className="text-lg font-display font-semibold text-white mb-2">Kano 분석 결과가 WS-7로 통합되었습니다</h2>
                    <p className="text-gray-500 text-sm mb-6">프로젝트 홈의 [WS-7] Kano 분석 집계표에서 동일한 분석 결과를 확인하세요.</p>
                    <Link href={`/project/${projectId}`} className="btn-primary inline-flex">
                        WS-7로 이동
                    </Link>
                </div>
            </main>
        </div>
    );
}
