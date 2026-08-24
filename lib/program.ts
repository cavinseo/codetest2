// 프로그램(기관 단위로 개설하는 주제별 단위)에 관한 순수 판정 로직.
//
// Program 자체의 CRUD 권한은 시스템 역할(lib/member-roles.canManagePrograms)로
// 걸리지만, "이 프로그램을" 다룰 수 있는지는 역할만으로 정해지지 않는다 —
// 매니저는 자신이 개설한 프로그램만 만지고, 관리자는 전부 만진다. 이 파일은
// 그 "이 프로그램" 단위 판정을 모은다.
import type { MemberRole } from './member-roles';

export interface ProgramManagerRef {
    managerId: string;
}

/**
 * 이 프로그램 안에서 초대 코드를 발행하거나 프로젝트를 개설할 수 있는가.
 *
 * 관리자는 모든 프로그램을 만질 수 있다. 매니저는 자신이 개설한(managerId 가
 * 자신인) 프로그램만 만질 수 있다 — 여러 매니저가 각자 다른 기관의 프로그램을
 * 운영할 때, 서로 다른 프로그램에 함부로 끼어들지 못하게 한다.
 */
export function canManageThisProgram(
    actor: { role: MemberRole; userId: string },
    program: ProgramManagerRef
): boolean {
    if (actor.role === 'ADMIN') return true;
    return actor.role === 'PROGRAM_MANAGER' && program.managerId === actor.userId;
}

/**
 * 이 멘티를 이 프로그램에 속한 프로젝트의 소유자로 지정할 수 있는가.
 *
 * 멘티는 자신이 가입한(초대 코드로 배정된) 프로그램에만 속한다. 다른
 * 프로그램의 프로젝트 소유자로 지정하면 "멘티의 초대코드는 해당하는
 * 프로그램에만 참여할 수 있다"는 규칙이 깨진다.
 */
export function canOwnProjectIn(mentee: { role: MemberRole; programId: string | null }, programId: string): boolean {
    return mentee.role === 'MENTEE' && mentee.programId === programId;
}

/** 프로그램 운영 기간이 올바른가. 종료가 시작보다 뒤여야 한다. */
export function isValidProgramPeriod(startsAt: Date, endsAt: Date): boolean {
    return endsAt.getTime() > startsAt.getTime();
}
