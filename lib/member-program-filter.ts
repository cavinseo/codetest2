// 회원·초대 목록의 프로그램별 보기 판정과 그 선택값의 보관을 맡는다.
//
// 프로그램에 직접 소속되는 것은 멘티뿐이라(User.programId) 멘토·매니저는 배정과
// 담당 관계에서 소속을 따로 계산해야 프로그램별로 나눠 볼 수 있다.

export const ALL_PROGRAMS = 'ALL';

// 새로고침과 브라우저 재시작에도 로그아웃 전까지 유지해야 해서 localStorage 를 쓴다.
const STORAGE_KEY = 'admin-program-filter';

export interface ProgramRelations {
    assignedMentees: Array<{ mentee: { programId: string | null } }>;
    managedPrograms: Array<{ id: string }>;
}

/** 담당 멘티의 프로그램과 직접 담당하는 프로그램을 합쳐 중복 없이 돌려준다. */
export function relatedProgramIds({ assignedMentees, managedPrograms }: ProgramRelations): string[] {
    const ids = [
        ...assignedMentees.map(({ mentee }) => mentee.programId),
        ...managedPrograms.map(({ id }) => id),
    ].filter((id): id is string => id !== null);
    return [...new Set(ids)];
}

export function belongsToProgram(
    member: { programId?: string | null; relatedProgramIds?: string[] },
    programId: string
): boolean {
    if (programId === ALL_PROGRAMS) return true;
    return member.programId === programId || member.relatedProgramIds?.includes(programId) === true;
}

// 저장소는 사생활 보호 모드 등에서 예외를 던질 수 있다. 필터 유지는 편의 기능이므로
// 실패해도 화면은 '전체'로 정상 동작해야 한다.
export function readStoredProgramFilter(): string {
    try {
        return window.localStorage.getItem(STORAGE_KEY) ?? ALL_PROGRAMS;
    } catch {
        return ALL_PROGRAMS;
    }
}

export function storeProgramFilter(programId: string): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, programId);
    } catch { /* 유지만 되지 않을 뿐 현재 화면의 필터는 동작한다 */ }
}

export function clearStoredProgramFilter(): void {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* 지울 수 없는 저장소라면 애초에 저장되지도 않았다 */ }
}
