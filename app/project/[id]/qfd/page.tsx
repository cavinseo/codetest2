'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import QFDMatrix from '@/components/project/QFDMatrix';
import { ReadOnlyNotice, useProjectEditAccess } from '@/components/project/WorksheetEditGuard';

export default function QFDPage() {
    const params = useParams();
    const projectId = params.id as string;
    // QFD 는 fieldset 대신 자체 readOnly 로 잠근다(프로젝트 홈과 같은 방식). 권한 확인 전에도 잠근다.
    const editAccess = useProjectEditAccess(projectId);

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
                        <h1 className="text-xl font-display font-bold text-white">[WS-9] QFD</h1>
                    </div>
                </div>
            </header>

            <main className="relative z-10 mx-auto w-full max-w-[1800px] px-3 py-8 sm:px-4 lg:px-6 2xl:px-8">
                <ReadOnlyNotice access={editAccess} />
                <QFDMatrix projectId={projectId} readOnly={editAccess !== 'edit'} />
            </main>
        </div>
    );
}
