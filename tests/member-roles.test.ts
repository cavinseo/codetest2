import { describe, expect, it } from 'vitest';
import {
    DEFAULT_ACCESS_DURATION_DAYS,
    accessExpiryFrom,
    canAssignMentor,
    canCreateProject,
    canIssueInviteCode,
    canListAllProjects,
    canManageMembers,
    canReadAnyProject,
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
    { role: 'PROGRAM_MANAGER', manageMembers: false, issueInvite: true, assignMentor: true, createProject: false, listAllProjects: true, readAnyProject: false },
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

    it('매니저는 목록은 보지만 내용은 못 본다', () => {
        // 배정 대상을 고르려면 목록이 필요하지만, 멘티 자료가 다 보이면 안 된다.
        expect(canListAllProjects('PROGRAM_MANAGER')).toBe(true);
        expect(canReadAnyProject('PROGRAM_MANAGER')).toBe(false);
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
