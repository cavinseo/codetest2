// 사용자 정보 화면이 보여주는 "내 소속" 을 정리하는 순수 로직.
//
// 역할마다 보는 것이 다르다:
//   멘티            내가 속한 프로그램 하나 + 내 프로젝트를 맡은 담당 멘토
//   멘토            내가 배정된 프로젝트들을 프로그램별로 묶은 것
//   프로그램 매니저   내가 개설한 프로그램과 그 안의 프로젝트
//
// 멘토·매니저 쪽은 결국 "프로그램별 프로젝트 목록" 이라 같은 모양으로 맞춘다.

export interface ProgramRef {
    id: string;
    name: string;
    organization: string;
    startsAt: string;
    endsAt: string;
}

export interface ProjectRef {
    id: string;
    name: string;
    /** 매니저 화면에서 이 프로젝트를 누가 갖고 있는지 보여준다. 없을 수 있다. */
    ownerName?: string | null;
}

export interface ProgramWithProjects extends ProgramRef {
    projects: ProjectRef[];
}

export interface MentorRef {
    id: string;
    name: string | null;
    email: string;
    /** 이 멘토가 맡고 있는 내 프로젝트 이름들. 한 사람이 여럿을 맡을 수 있다. */
    projectNames: string[];
}

/**
 * 멘토가 배정된 프로젝트들을 프로그램별로 묶는다.
 *
 * 배정은 ProjectMember 단위라 같은 프로그램의 프로젝트 두 개에 배정되면 행이
 * 둘로 나온다. 화면에는 프로그램이 한 번만 나와야 하므로 여기서 합친다.
 * 프로그램 등장 순서와 그 안의 프로젝트 순서는 입력 순서를 그대로 지킨다 —
 * 정렬은 쿼리(orderBy)가 정하게 두고 이 함수는 묶기만 한다.
 */
export function groupProjectsByProgram(
    rows: Array<{ project: ProjectRef & { program: ProgramRef } }>
): ProgramWithProjects[] {
    const byProgram = new Map<string, ProgramWithProjects>();

    for (const { project } of rows) {
        const { program, ...projectFields } = project;
        let entry = byProgram.get(program.id);
        if (!entry) {
            entry = { ...program, projects: [] };
            byProgram.set(program.id, entry);
        }
        entry.projects.push(projectFields);
    }

    return [...byProgram.values()];
}

/**
 * 멘티의 프로젝트들에 붙은 코치를 사람 단위로 합친다.
 *
 * 한 멘토가 내 프로젝트 여러 개를 맡을 수 있어 그대로 펴면 같은 사람이 여러 번
 * 나온다. 사람으로 묶고 맡은 프로젝트 이름을 모아 준다.
 */
export function collectMentors(
    projects: Array<{
        name: string;
        members: Array<{ user: { id: string; name: string | null; email: string } }>;
    }>
): MentorRef[] {
    const byUser = new Map<string, MentorRef>();

    for (const project of projects) {
        for (const { user } of project.members) {
            let entry = byUser.get(user.id);
            if (!entry) {
                entry = { id: user.id, name: user.name, email: user.email, projectNames: [] };
                byUser.set(user.id, entry);
            }
            entry.projectNames.push(project.name);
        }
    }

    return [...byUser.values()];
}
