// Kano 분석의 시스템 역할과 프로젝트 역할 조합 및 워크시트 별칭 권한을 검증한다.
import { describe, expect, it } from 'vitest';
import type { ProjectAccess, ProjectAccessRole } from '../lib/authorization';
import type { MemberRole } from '../lib/member-roles';
import { getKanoAnalysisAccess, isKanoAnalysisWorksheet } from '../lib/kano-analysis-access';

const projectRoles: ProjectAccessRole[] = ['OWNER', 'EDITOR', 'COACH', 'ADMIN', 'VIEWER'];
const cases: Array<[MemberRole, ProjectAccessRole, boolean, boolean]> = [
    ...projectRoles.map(role => ['MENTEE', role, false, false] as [MemberRole, ProjectAccessRole, boolean, boolean]),
    ...projectRoles.map(role => ['MENTOR', role, role === 'EDITOR', role === 'EDITOR'] as [MemberRole, ProjectAccessRole, boolean, boolean]),
    ...projectRoles.map(role => ['PROGRAM_MANAGER', role, role === 'EDITOR', role === 'EDITOR'] as [MemberRole, ProjectAccessRole, boolean, boolean]),
    ...projectRoles.map(role => ['ADMIN', role, true, false] as [MemberRole, ProjectAccessRole, boolean, boolean]),
];

function access(systemRole: MemberRole, projectRole: ProjectAccessRole): ProjectAccess {
    return {
        role: projectRole,
        user: { userId: 'actor', email: 'actor@example.test', name: null, role: systemRole, isAdmin: systemRole === 'ADMIN', accessExpiresAt: null },
    };
}

describe('Kano 분석 역할 판정', () => {
    it.each(cases)('%s + %s의 조회 %s와 수정 %s를 구분한다', (systemRole, projectRole, canRead, canEdit) => {
        expect(getKanoAnalysisAccess(access(systemRole, projectRole))).toEqual({ canRead, canEdit });
    });

    it('멘티의 관리자 플래그만으로 시스템 역할 제한을 우회할 수 없다', () => {
        const actor = access('MENTEE', 'EDITOR');
        actor.user.isAdmin = true;
        expect(getKanoAnalysisAccess(actor)).toEqual({ canRead: false, canEdit: false });
    });
});

describe('Kano 분석 워크시트 별칭', () => {
    it.each(['kano-aggregation', 'kano/analysis', 'timko'])('%s는 같은 분석 권한으로 제한한다', worksheetId => {
        expect(isKanoAnalysisWorksheet(worksheetId)).toBe(true);
    });

    it.each(['kano', 'qfd', 'spec', '', 'KANO/analysis', '../kano/analysis', 'kano/analysis?view=summary'])('%s를 분석 워크시트로 오인하지 않는다', worksheetId => {
        expect(isKanoAnalysisWorksheet(worksheetId)).toBe(false);
    });
});
