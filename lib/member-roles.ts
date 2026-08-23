// 회원의 시스템 역할과 그에 따른 권한.
//
// 프로젝트 단위 역할(ProjectMember.role: OWNER/EDITOR/COACH/ADMIN)과 혼동하지 말 것.
// 이쪽은 "이 사람이 시스템에서 무엇을 할 수 있는가", 저쪽은 "이 프로젝트 안에서
// 무엇을 할 수 있는가"를 정한다.
//
//   ADMIN            모든 권한
//   PROGRAM_MANAGER  멘토 배정, 초대 코드 발행. 멘토를 겸할 수 있다
//   MENTOR           배정된 프로젝트만 열람(읽기 전용)
//   MENTEE           본인이 만든 프로젝트만. 프로젝트 생성 가능

export const MEMBER_ROLES = ['ADMIN', 'PROGRAM_MANAGER', 'MENTOR', 'MENTEE'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** 초대 코드로 모집할 수 있는 역할. 관리자·매니저는 코드로 만들지 않는다. */
export const INVITABLE_ROLES = ['MENTOR', 'MENTEE'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
    ADMIN: '관리자',
    PROGRAM_MANAGER: '프로그램 매니저',
    MENTOR: '멘토',
    MENTEE: '멘티',
};

/** 초대 코드로 들어온 회원의 기본 접근 기간(약 3개월). */
export const DEFAULT_ACCESS_DURATION_DAYS = 90;

export function parseMemberRole(value: unknown): MemberRole | null {
    return MEMBER_ROLES.includes(value as MemberRole) ? (value as MemberRole) : null;
}

export function parseInvitableRole(value: unknown): InvitableRole | null {
    return INVITABLE_ROLES.includes(value as InvitableRole) ? (value as InvitableRole) : null;
}

// ─── 권한 판정 ──────────────────────────────────────────────────

/** 회원 계정을 만들고 가입을 승인할 수 있는가. */
export function canManageMembers(role: MemberRole): boolean {
    return role === 'ADMIN';
}

/** 초대 코드를 발행할 수 있는가. */
export function canIssueInviteCode(role: MemberRole): boolean {
    return role === 'ADMIN' || role === 'PROGRAM_MANAGER';
}

/** 프로젝트에 멘토를 배정할 수 있는가. */
export function canAssignMentor(role: MemberRole): boolean {
    return role === 'ADMIN' || role === 'PROGRAM_MANAGER';
}

/** 프로젝트를 새로 만들 수 있는가. */
export function canCreateProject(role: MemberRole): boolean {
    // 멘티가 과제를 만들고 멘토가 붙는 구조다. 멘토는 만들지 않는다.
    return role === 'ADMIN' || role === 'MENTEE';
}

/**
 * 배정 대상을 고르기 위해 전체 프로젝트 목록을 볼 수 있는가.
 * 목록(이름·소유자)만이며, 워크시트 내용 열람과는 다르다.
 */
export function canListAllProjects(role: MemberRole): boolean {
    return role === 'ADMIN' || role === 'PROGRAM_MANAGER';
}

/**
 * 소속과 무관하게 모든 프로젝트의 내용을 열 수 있는가.
 * 매니저는 전체를 읽되 고치지는 못한다(canWriteAnyProject 참고).
 */
export function canReadAnyProject(role: MemberRole): boolean {
    return role === 'ADMIN' || role === 'PROGRAM_MANAGER';
}

/** 소속과 무관하게 모든 프로젝트를 고칠 수 있는가. */
export function canWriteAnyProject(role: MemberRole): boolean {
    return role === 'ADMIN';
}

// ─── 접근 기간 ──────────────────────────────────────────────────

export function accessExpiryFrom(
    issuedAt: Date,
    durationDays: number = DEFAULT_ACCESS_DURATION_DAYS
): Date {
    const expiry = new Date(issuedAt);
    expiry.setDate(expiry.getDate() + durationDays);
    return expiry;
}

/** 접근 기간이 지났는지. null 은 만료 없음(관리자가 직접 만든 계정). */
export function isAccessExpired(accessExpiresAt: Date | null | undefined, now: Date = new Date()): boolean {
    if (!accessExpiresAt) return false;
    return accessExpiresAt.getTime() <= now.getTime();
}

// ─── 역할 전환 ──────────────────────────────────────────────────

/**
 * from 에서 to 로 역할을 바꿀 수 있는가.
 *
 *   from \ to         ADMIN  PROGRAM_MANAGER  MENTOR  MENTEE
 *   ADMIN               가능      가능          가능    가능
 *   PROGRAM_MANAGER      가능      가능          가능    불가
 *   MENTOR               가능      가능          가능    불가
 *   MENTEE               가능      불가          불가    가능
 *
 * 멘티는 제자리다. 멘티는 프로그램에 참가한 기업 담당자이지 멘토 후보가
 * 아니라서, 이 함수로는 멘토로도 매니저로도 올라가지 않는다. 멘토가 되는
 * 길은 가입할 때 스스로 멘토를 선택하거나, 멘토용 초대 코드를 받거나,
 * 관리자가 멘토 계정을 직접 만드는 세 가지뿐이며 전부 이 함수 밖에서
 * 일어난다.
 *
 * 매니저는 멘토 중에서 고르는 자리라 멘토·매니저 사이는 양방향으로 열어
 * 둔다. 다만 어느 쪽도 멘티로는 내려가지 않는다.
 *
 * 관리자는 예외다. from 이나 to 어느 한쪽이라도 관리자면 항상 허용한다.
 * 그러지 않으면 관리자를 새로 임명하거나 관리자를 다른 역할로 옮길 방법이
 * 없어진다.
 */
export function canTransitionRole(from: MemberRole, to: MemberRole): boolean {
    if (from === to) return true;
    if (from === 'ADMIN' || to === 'ADMIN') return true;
    if (from === 'MENTEE' || to === 'MENTEE') return false;
    return true;
}
