// 프로젝트 워크시트 페이지의 공통 상단 메뉴 레이아웃을 제공합니다.
import type { ReactNode } from 'react';
import ProjectWorksheetMenu from '@/components/project/ProjectWorksheetMenu';

interface ProjectLayoutProps {
    children: ReactNode;
    params: Promise<{ id: string }>;
}

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
    const { id } = await params;

    return (
        <>
            <ProjectWorksheetMenu projectId={id} />
            {children}
        </>
    );
}
