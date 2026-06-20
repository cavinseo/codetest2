'use client';

import { useParams } from 'next/navigation';
import KanoManager from '@/components/project/KanoManager';
import Link from 'next/link';

export default function KanoSurveyPage() {
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
                                <h1 className="text-xl font-display font-bold text-white">[WS-6] Kano 설문 관리</h1>
                                <p className="text-xs text-gray-500 mt-0.5">고객에게 설문을 보내고 응답을 수집하세요</p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <KanoManager projectId={projectId} initialView="manage" />
            </main>
        </div>
    );
}
