// 관리자 프로젝트 이관 화면과 API가 공유하는 미리보기 형식이다.
export interface ProjectTransferPerson {
    id: string;
    name: string | null;
    email: string;
}

export interface ProjectTransferCandidate extends ProjectTransferPerson {
    program: { id: string; name: string };
}

export interface ProjectTransferPreview {
    project: { id: string; name: string; owner: ProjectTransferPerson; program: { id: string; name: string } };
    target: ProjectTransferCandidate;
    sourceMentor: ProjectTransferPerson | null;
    currentTargetMentor: ProjectTransferPerson | null;
    nextMentor: ProjectTransferPerson | null;
    targetProjectCount: number;
    programChanged: boolean;
    mentorChanged: boolean;
    previewToken: string;
}
