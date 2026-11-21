// 프로젝트 배정에 따라 Kano 분석 워크시트의 열람·편집 범위를 판정한다.
import type { ProjectAccess } from './authorization';

export function getKanoAnalysisAccess(access: ProjectAccess) {
    const memberRole = access.user?.role;
    const canEdit = access.role === 'EDITOR'
        && (memberRole === 'MENTOR' || memberRole === 'PROGRAM_MANAGER');
    return { canRead: canEdit || memberRole === 'ADMIN', canEdit };
}

export function isKanoAnalysisWorksheet(worksheetId: string) {
    return worksheetId === 'kano-aggregation' || worksheetId === 'kano/analysis' || worksheetId === 'timko';
}
