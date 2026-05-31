'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import QFDMatrix from '@/components/project/QFDMatrix';

export default function QFDPage() {
    const params = useParams();
    const projectId = params.id as string;

    return (
        <div className="min-h-screen bg-surface-900 bg-grid">
            <header className="relative z-10 glass border-b border-white/[0.06] rounded-none">
                <div className="mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-4 lg:px-6 2xl:px-8">
                    <div className="flex items-center gap-4">
                        <Link href={`/project/${projectId}`} className="btn-ghost flex items-center gap-1 text-sm">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            프로젝트
                        </Link>
                        <div className="h-6 w-px bg-white/10" />
                        <h1 className="text-xl font-display font-bold text-white">QFD</h1>
                    </div>
                </div>
            </header>

            <main className="relative z-10 mx-auto w-full max-w-[1800px] px-3 py-8 sm:px-4 lg:px-6 2xl:px-8">
                <QFDMatrix projectId={projectId} />
            </main>
        </div>
    );
}
