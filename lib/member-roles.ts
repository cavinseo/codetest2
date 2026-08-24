// 회원의 시스템 역할과 그에 따른 권한.
//
// 프로젝트 단위 역할(ProjectMember.role: OWNER/EDITOR/COACH/ADMIN)과 혼동하지 말 것.
// 이쪽은 "이 사람이 시스템에서 무엇을 할 수 있는가", 저쪽은 "이 프로젝트 안에서
// 무엇을 할 수 있는가"를 정한다.
//
//   ADMIN            모든 권한
//   PROGRAM_MANAGER  멘토 배정, 초대 코드 발행, 프로젝트 생성. 멘토를 겸할 수 있다
//   MENTOR           배정된 프로젝트만 열람(읽기 전용)
//   MENTEE           배정된 프로젝트만. 프로젝트는 만들지 못한다

export const MEMBER_ROLES = ['ADMIN', 'PROGRAM_MANAGER', 'MENTOR', 'MENTEE'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/**
 * 초대 코드로 모집할 수 있는 역할.
 *
 * 멘티만 코드로 받는다. 코드는 프로그램에 묶이므로(InviteCode.programId) 그
 * 프로그램 소속 멘티를 모으는 통로다. 멘토는 정식 가입(자기 신고 후 관리자
 * 승인)으로만 들어온다 — 멘토는 여러 프로그램의 프로젝트에 배정될 수 있어
 * 코드 하나로 프로그램에 묶는 모델과 맞지 않는다. 관리자·매니저는 코드로
 * 만들지 않는다.
 */
export const INVITABLE_ROLES = ['MENTEE'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/**
 * 관리자가 계정을 직접 만들 때 고를 수 있는 역할.
 *
 * INVITABLE_ROLES 와 다른 목록이다 — 코드 발급은 프로그램 배정이라는 별개의
 * 제약이 있어 멘티로 좁혔지만, 관리자가 임시 비밀번호로 계정을 직접 트는
 * 것은 그 제약과 무관하다. 여기서 하나로 합치면 "멘토는 코드로 안 받는다"는
 * 규칙이 "관리자도 멘토 계정을 못 만든다"로 조용히 번진다.
 */
export const DIRECT_CREATE_ROLES = ['MENTOR', 'MENTEE'] as const;
export type DirectCreateRole = (typeof DIRECT_CREATE_ROLES)[number];

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

export function parseDirectCreateRole(value: unknown): DirectCreateRole | null {
    return DIRECT_CREATE_ROLES.includes(value as DirectCreateRole) ? (value as DirectCreateRole) : null;
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

/**
 * 프로젝트를 새로 만들 수 있는가.
 *
 * 멘티는 자기 프로젝트를 스스로 연다 — 자신이 속한 프로그램 안에, 자신을
 * 소유자로. 관리자·매니저는 그 밖에도 남(멘티)을 소유자로 지정해 열 수 있다.
 * "누가 만드는가"와 "누가 갖는가"가 갈리는 곳이라, 소유자 쪽 판정은
 * lib/program.ts 의 canOwnProjectIn 이 따로 맡는다.
 *
 * 멘토는 만들지 못한다. 멘토는 남의 과제에 배정돼 보는 자리다.
 */
export function canCreateProject(role: MemberRole): boolean {
    return role === 'ADMIN' || role === 'PROGRAM_MANAGER' || role === 'MENTEE';
}

/**
 * 남을 소유자로 지정해 프로젝트를 열 수 있는가.
 *
 * 멘티도 프로젝트를 만들 수 있게 되면서 canCreateProject 만으로는 "내 것을
 * 만드는 것"과 "남의 것을 만들어 주는 것"을 구분할 수 없게 됐다. 이 판정이
 * 없으면 멘티가 ownerMenteeId 를 실어 남의 이름으로 과제를 열 수 있다.
 */
export function canCreateProjectForOthers(role: MemberRole): boolean {
    return role === 'ADMIN' || role === 'PROGRAM_MANAGER';
}

/** 프로그램을 새로 개설할 수 있는가. */
export function canManagePrograms(role: MemberRole): boolean {
    return role === 'ADMIN' || role === 'PROGRAM_MANAGER';
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
 *   ADMIN               가능      불가          불가    불가
 *   PROGRAM_MANAGER      불가      가능          가능    불가
 *   MENTOR               불가      가능          가능    불가
 *   MENTEE               불가      불가          불가    가능
 *
 * 관리자와 멘티는 각자 따로 떨어진 자리라 역할 전환이 건드리지 않는다.
 * 관리자는 회원 전환 밖에서(시딩, DB 직접 수정, ADMIN_EMAILS 환경변수) 만들어지고
 * 물러나는 자리이므로, 역할 전환으로는 관리자로 들어오지도 관리자에서
 * 나가지도 못한다. 멘티가 되는 길은 가입할 때 멘티를 선택하거나, 멘티용
 * 초대 코드를 받거나, 관리자가 멘티 계정을 직접 만드는 세 가지뿐이며 이
 * 역시 전부 이 함수 밖에서 일어난다. 멘토가 되는 길도 마찬가지다.
 *
 * 실제로 오가는 전환은 매니저 ↔ 멘토 하나뿐이다. 매니저는 멘토 중에서
 * 고르는 자리이고, 물러나면 다시 멘토로 돌아간다.
 */
export function canTransitionRole(from: MemberRole, to: MemberRole): boolean {
    if (from === to) return true;
    // 실질적인 전환은 매니저 ↔ 멘토뿐이다. 그 밖에는 전부 같은 역할일 때만
    // 통과하므로(위에서 이미 걸러졌다) 여기까지 왔다면 막는다.
    return (
        (from === 'PROGRAM_MANAGER' && to === 'MENTOR') ||
        (from === 'MENTOR' && to === 'PROGRAM_MANAGER')
    );
}
