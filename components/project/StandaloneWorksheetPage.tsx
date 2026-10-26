// 단독 워크시트 페이지(/project/[id]/sales 등)의 공통 틀.
//
// 매출·개선포인트·목표스펙·자산·자금 등 8개 페이지가 같은 배경·폭·편집 권한 관문을 각자 복사해
// 들고 있었다(2026-10-25 코드 리뷰 D2). 틀을 바꿀 때 한 곳만 고치도록 합쳤다.
import type { ReactNode } from 'react';
import WorksheetEditGuard from './WorksheetEditGuard';

/** Next.js 가 동적 경로 [id] 를 넘기는 형태. */
export interface StandaloneWorksheetPageProps {
    params: Promise<{ id: string }>;
}

export default function StandaloneWorksheetPage({ projectId, children }: { projectId: string; children?: ReactNode }) {
    return (
        <main className="min-h-screen bg-surface-900 bg-grid px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1800px]">
                <WorksheetEditGuard projectId={projectId}>
                    {children}
                </WorksheetEditGuard>
            </div>
        </main>
    );
}
