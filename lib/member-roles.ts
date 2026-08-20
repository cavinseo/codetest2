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
 * 매니저는 목록·배정만 하고 내용은 본인이 멘토로 배정된 곳만 본다.
 */
export function canReadAnyProject(role: MemberRole): boolean {
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
