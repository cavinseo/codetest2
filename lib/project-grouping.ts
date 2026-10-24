// 대시보드의 프로젝트를 소속 프로그램별로 묶는다.
//
// 멘티의 소속 프로그램은 하나지만, 팀원으로 초대받은 프로젝트는 다른 프로그램에 속할 수
// 있다. 그래서 회원이 아니라 프로젝트의 programId 를 기준으로 묶는다.

export interface ProgramScopedProject {
    programId: string;
    programName: string;
}

export interface ProgramProjectGroup<T extends ProgramScopedProject> {
    programId: string;
    programName: string;
    projects: T[];
}

/**
 * 프로그램 이름 가나다순으로 묶음을 돌려준다. 묶음 안의 순서는 입력 순서(목록 API 의
 * 최근 수정순)를 그대로 지킨다 — 다시 정렬하면 방금 고친 프로젝트가 뒤로 밀린다.
 */
export function groupProjectsByProgram<T extends ProgramScopedProject>(projects: T[]): ProgramProjectGroup<T>[] {
    const groups = new Map<string, ProgramProjectGroup<T>>();
    for (const project of projects) {
        const group = groups.get(project.programId);
        if (group) group.projects.push(project);
        else groups.set(project.programId, { programId: project.programId, programName: project.programName, projects: [project] });
    }
    return [...groups.values()].sort((a, b) => a.programName.localeCompare(b.programName, 'ko'));
}
