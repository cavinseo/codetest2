'use client';
// 독립 워크시트 페이지에 공통 그림 다운로드 영역을 적용한다.
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { WORKSHEET_LINKS } from '@/lib/worksheet-pages';
import WorksheetImageExport from './WorksheetImageExport';

export default function WorksheetPageExport({ projectId, children }: { projectId: string; children: ReactNode }) {
    const pathname = usePathname();
    const worksheet = WORKSHEET_LINKS.find(item => pathname === `/project/${projectId}/${item.href}`);
    return worksheet
        ? <WorksheetImageExport key={pathname} title={worksheet.label} projectId={worksheet.href === 'kano' ? undefined : projectId} worksheetId={worksheet.href}>{children}</WorksheetImageExport>
        : children;
}
