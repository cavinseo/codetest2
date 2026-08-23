import { describe, expect, it } from 'vitest';
import {
    DEFAULT_ACCESS_DURATION_DAYS,
    MEMBER_ROLE_LABELS,
    accessExpiryFrom,
    canAssignMentor,
    canCreateProject,
    canIssueInviteCode,
    canListAllProjects,
    canManageMembers,
    canReadAnyProject,
    canTransitionRole,
    canWriteAnyProject,
    isAccessExpired,
    parseInvitableRole,
    parseMemberRole,
    type MemberRole,
} from '../lib/member-roles';

describe('역할 파싱', () => {
    it('알려진 역할만 통과시킨다', () => {
        expect(parseMemberRole('ADMIN')).toBe('ADMIN');
        expect(parseMemberRole('MENTEE')).toBe('MENTEE');
        expect(parseMemberRole('SUPERUSER')).toBeNull();
        expect(parseMemberRole(null)).toBeNull();
        expect(parseMemberRole(undefined)).toBeNull();
    });

    it('초대 코드로는 멘토·멘티만 모집할 수 있다', () => {
        expect(parseInvitableRole('MENTOR')).toBe('MENTOR');
        expect(parseInvitableRole('MENTEE')).toBe('MENTEE');
        // 코드로 관리자·매니저가 생기면 권한 상승 경로가 된다.
        expect(parseInvitableRole('ADMIN')).toBeNull();
        expect(parseInvitableRole('PROGRAM_MANAGER')).toBeNull();
    });

    it('네 역할 모두 한글 표시 이름을 갖는다', () => {
        expect(MEMBER_ROLE_LABELS.ADMIN).toBe('관리자');
        expect(MEMBER_ROLE_LABELS.PROGRAM_MANAGER).toBe('프로그램 매니저');
        expect(MEMBER_ROLE_LABELS.MENTOR).toBe('멘토');
        expect(MEMBER_ROLE_LABELS.MENTEE).toBe('멘티');
    });
});

// 표로 두면 역할이 늘 때 어디를 채워야 하는지 바로 보인다.
const matrix: Array<{
    role: MemberRole;
    manageMembers: boolean;
    issueInvite: boolean;
    assignMentor: boolean;
    createProject: boolean;
    listAllProjects: boolean;
    readAnyProject: boolean;
}> = [
    { role: 'ADMIN', manageMembers: true, issueInvite: true, assignMentor: true, createProject: true, listAllProjects: true, readAnyProject: true },
    { role: 'PROGRAM_MANAGER', manageMembers: false, issueInvite: true, assignMentor: true, createProject: false, listAllProjects: true, readAnyProject: true },
    { role: 'MENTOR', manageMembers: false, issueInvite: false, assignMentor: false, createProject: false, listAllProjects: false, readAnyProject: false },
    { role: 'MENTEE', manageMembers: false, issueInvite: false, assignMentor: false, createProject: true, listAllProjects: false, readAnyProject: false },
];

describe.each(matrix)('$role 권한', (row) => {
    it('회원 관리', () => expect(canManageMembers(row.role)).toBe(row.manageMembers));
    it('초대 코드 발행', () => expect(canIssueInviteCode(row.role)).toBe(row.issueInvite));
    it('멘토 배정', () => expect(canAssignMentor(row.role)).toBe(row.assignMentor));
    it('프로젝트 생성', () => expect(canCreateProject(row.role)).toBe(row.createProject));
    it('전체 목록 조회', () => expect(canListAllProjects(row.role)).toBe(row.listAllProjects));
    it('전체 내용 열람', () => expect(canReadAnyProject(row.role)).toBe(row.readAnyProject));
});

describe('권한 경계 요약', () => {
    it('회원 관리와 승인은 관리자만 한다', () => {
        expect(canManageMembers('PROGRAM_MANAGER')).toBe(false);
    });

    it('매니저는 목록과 내용을 모두 본다', () => {
        // 배정 대상을 고르려면 목록이 필요하고, 진행 상황을 보려면 내용도 필요하다.
        // 다만 고칠 수는 없다. canWriteAnyProject 가 관리자만 허용한다.
        expect(canListAllProjects('PROGRAM_MANAGER')).toBe(true);
        expect(canReadAnyProject('PROGRAM_MANAGER')).toBe(true);
    });

    it('멘토는 프로젝트를 만들지 않는다', () => {
        expect(canCreateProject('MENTOR')).toBe(false);
        expect(canCreateProject('MENTEE')).toBe(true);
    });
});

describe('접근 기간', () => {
    it('기본은 90일이다', () => {
        expect(DEFAULT_ACCESS_DURATION_DAYS).toBe(90);

        const issued = new Date('2026-01-01T00:00:00Z');
        const expiry = accessExpiryFrom(issued);

        expect(expiry.toISOString().slice(0, 10)).toBe('2026-04-01');
    });

    it('기간을 직접 줄 수 있다', () => {
        const expiry = accessExpiryFrom(new Date('2026-01-01T00:00:00Z'), 30);

        expect(expiry.toISOString().slice(0, 10)).toBe('2026-01-31');
    });

    it('원본 날짜를 바꾸지 않는다', () => {
        const issued = new Date('2026-01-01T00:00:00Z');
        accessExpiryFrom(issued);

        expect(issued.toISOString().slice(0, 10)).toBe('2026-01-01');
    });

    it('만료 여부를 판정한다', () => {
        const now = new Date('2026-06-01T00:00:00Z');

        expect(isAccessExpired(new Date('2026-05-31T23:59:59Z'), now)).toBe(true);
        expect(isAccessExpired(new Date('2026-06-01T00:00:01Z'), now)).toBe(false);
        // 경계: 만료 시각과 같으면 만료로 본다.
        expect(isAccessExpired(new Date('2026-06-01T00:00:00Z'), now)).toBe(true);
    });

    it('만료 시각이 없으면 만료되지 않는다', () => {
        expect(isAccessExpired(null)).toBe(false);
        expect(isAccessExpired(undefined)).toBe(false);
    });
});

describe('전체 프로젝트 읽기·쓰기', () => {
    it('관리자와 매니저는 전체를 읽는다', () => {
        expect(canReadAnyProject('ADMIN')).toBe(true);
        expect(canReadAnyProject('PROGRAM_MANAGER')).toBe(true);
    });

    it('멘토와 멘티는 전체를 읽지 못한다', () => {
        expect(canReadAnyProject('MENTOR')).toBe(false);
        expect(canReadAnyProject('MENTEE')).toBe(false);
    });

    it('전체 쓰기는 관리자만 된다', () => {
        // 매니저는 전체를 보되 고치지는 못한다. 읽기와 쓰기를 나눠 둔 이유다.
        expect(canWriteAnyProject('ADMIN')).toBe(true);
        expect(canWriteAnyProject('PROGRAM_MANAGER')).toBe(false);
        expect(canWriteAnyProject('MENTOR')).toBe(false);
        expect(canWriteAnyProject('MENTEE')).toBe(false);
    });
});

describe('canTransitionRole', () => {
    it('멘토에서 매니저로 승격할 수 있다', () => {
        expect(canTransitionRole('MENTOR', 'PROGRAM_MANAGER')).toBe(true);
    });

    it('매니저를 멘토로 해임할 수 있다', () => {
        expect(canTransitionRole('PROGRAM_MANAGER', 'MENTOR')).toBe(true);
    });

    it('멘티를 매니저로 올릴 수 없다', () => {
        // 매니저는 멘토 중에서 고르는 자리고, 멘티가 멘토를 거치는 길도
        // 이제는 막혀 있다. 그래서 멘티는 어느 경로로도 매니저가 되지 않는다.
        expect(canTransitionRole('MENTEE', 'PROGRAM_MANAGER')).toBe(false);
    });

    it('매니저를 바로 멘티로 내릴 수 없다', () => {
        expect(canTransitionRole('PROGRAM_MANAGER', 'MENTEE')).toBe(false);
    });

    it('멘토를 멘티로 내릴 수 없다', () => {
        // 멘티는 제자리다. 멘토·매니저 어느 쪽도 멘티로는 강등되지 않는다.
        expect(canTransitionRole('MENTOR', 'MENTEE')).toBe(false);
    });

    it('멘티는 멘토로도 오르지 않는다', () => {
        // 멘토가 되는 길은 가입 시 선택·초대 코드·관리자 생성뿐이며,
        // 역할 전환으로는 열리지 않는다.
        expect(canTransitionRole('MENTEE', 'MENTOR')).toBe(false);
    });

    it('관리자에서 나가는 전환은 열려 있다', () => {
        // 관리자를 해임할 길이 없으면 마지막 관리자를 바꿀 수 없다.
        expect(canTransitionRole('ADMIN', 'MENTOR')).toBe(true);
    });

    it('멘토와 매니저는 관리자가 될 수 있다', () => {
        expect(canTransitionRole('MENTOR', 'ADMIN')).toBe(true);
        expect(canTransitionRole('PROGRAM_MANAGER', 'ADMIN')).toBe(true);
    });

    it('관리자 예외는 매니저가 얽힌 전환에도 적용된다', () => {
        // 매니저 조건(멘토 ↔ 매니저)보다 관리자 예외가 먼저 걸려야 한다.
        expect(canTransitionRole('ADMIN', 'PROGRAM_MANAGER')).toBe(true);
        expect(canTransitionRole('PROGRAM_MANAGER', 'ADMIN')).toBe(true);
    });

    it('멘티는 관리자도 될 수 없다', () => {
        // 멘티 제자리 규칙이 관리자 예외보다 먼저 걸린다. 순서가 뒤바뀌면
        // 멘티가 관리자로 바로 올라가는 길이 열린다.
        expect(canTransitionRole('MENTEE', 'ADMIN')).toBe(false);
    });

    it('관리자도 멘티로는 내려가지 않는다', () => {
        // 멘티는 운영 인력이 아니라 참가자다. 관리자를 물러나게 하려면
        // 멘토나 매니저로 옮긴다.
        expect(canTransitionRole('ADMIN', 'MENTEE')).toBe(false);
    });

    it('같은 역할로의 전환은 허용한다', () => {
        expect(canTransitionRole('MENTOR', 'MENTOR')).toBe(true);
    });

    it('매니저에서 매니저로의 전환도 허용한다', () => {
        expect(canTransitionRole('PROGRAM_MANAGER', 'PROGRAM_MANAGER')).toBe(true);
    });

    it('멘티에서 멘티로의 전환도 허용한다', () => {
        expect(canTransitionRole('MENTEE', 'MENTEE')).toBe(true);
    });

    // 16개 조합을 전부 표로 확인한다. canTransitionRole 문서의 표를 그대로
    // 옮긴 것이라, 규칙이 바뀌면 이 표만 고치면 무엇이 바뀌었는지 한눈에 보인다.
    const transitionMatrix: Array<{ from: MemberRole; to: MemberRole; allowed: boolean }> = [
        { from: 'ADMIN', to: 'ADMIN', allowed: true },
        { from: 'ADMIN', to: 'PROGRAM_MANAGER', allowed: true },
        { from: 'ADMIN', to: 'MENTOR', allowed: true },
        { from: 'ADMIN', to: 'MENTEE', allowed: false },
        { from: 'PROGRAM_MANAGER', to: 'ADMIN', allowed: true },
        { from: 'PROGRAM_MANAGER', to: 'PROGRAM_MANAGER', allowed: true },
        { from: 'PROGRAM_MANAGER', to: 'MENTOR', allowed: true },
        { from: 'PROGRAM_MANAGER', to: 'MENTEE', allowed: false },
        { from: 'MENTOR', to: 'ADMIN', allowed: true },
        { from: 'MENTOR', to: 'PROGRAM_MANAGER', allowed: true },
        { from: 'MENTOR', to: 'MENTOR', allowed: true },
        { from: 'MENTOR', to: 'MENTEE', allowed: false },
        { from: 'MENTEE', to: 'ADMIN', allowed: false },
        { from: 'MENTEE', to: 'PROGRAM_MANAGER', allowed: false },
        { from: 'MENTEE', to: 'MENTOR', allowed: false },
        { from: 'MENTEE', to: 'MENTEE', allowed: true },
    ];

    describe.each(transitionMatrix)('$from → $to', ({ from, to, allowed }) => {
        it(allowed ? '허용한다' : '막는다', () => {
            expect(canTransitionRole(from, to)).toBe(allowed);
        });
    });
});
