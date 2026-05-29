'use client';

import { useParams } from 'next/navigation';
import QFDMatrix from '@/components/project/QFDMatrix';
import Link from 'next/link';

export default function QFDPage() {
    const params = useParams();
    const projectId = params.id as string;

    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative">
            <div className="bg-orb w-[400px] h-[400px] bg-primary-600/50 top-[-200px] right-[10%] opacity-10" />

            {/* Header */}
            <header className="relative z-10 glass border-b border-white/[0.06] rounded-none">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href={`/project/${projectId}`} className="btn-ghost text-sm flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                프로젝트 홈
                            </Link>
                            <div className="w-px h-6 bg-white/10" />
                            <h1 className="text-xl font-display font-bold text-white">QFD (품질기능전개) 분석</h1>
                        </div>
                    </div>
                </div>
            </header>

            <main className="relative z-10 w-full px-4 sm:px-6 lg:px-8 py-8">
                <div className="bg-gray-900/50 p-4 min-h-[500px] rounded-xl overflow-hidden">
                    <QFDMatrix projectId={projectId} />
                </div>
            </main>
        </div>
    );
}
