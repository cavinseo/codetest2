// 계정 삭제의 사유와 사전 점검 안내를 정하는 규칙. API 와 화면이 같은 문구를
// 쓰도록 한 곳에 둔다. 문구가 두 곳에 흩어지면 화면이 약속한 것과 서버가 하는
// 일이 어긋나는데, 되돌릴 수 없는 조작에서 그 어긋남은 사고가 된다.

export const DELETION_REASONS = ['self_request', 'misregistration', 'retention_expired'] as const;
export type DeletionReason = (typeof DELETION_REASONS)[number];

export const DELETION_REASON_LABELS: Record<DeletionReason, string> = {
    self_request: '본인 요청',
    misregistration: '오등록',
    retention_expired: '보유기간 경과',
};

export function parseDeletionReason(value: unknown): DeletionReason | null {
    return DELETION_REASONS.includes(value as DeletionReason) ? (value as DeletionReason) : null;
}

export interface MenteeDeletionPreview {
    /** 소유권이 프로그램 매니저에게 넘어갈 프로젝트. */
    transferProjects: { id: string; name: string; managerName: string | null }[];
    /** 발신자가 비워질 설문 초대 건수. 초대와 응답 자체는 남는다. */
    invitations: number;
    /** 가져온 사람이 비워질 엑셀 이관 이력 건수. */
    migrations: number;
    /** 함께 삭제될 초대 코드 수. 그 사람의 이메일이 남는 유일한 자리다. */
    inviteCodes: number;
}

/**
 * 사전 점검 결과를 사람이 읽는 줄로 만든다. 화면이 이 줄을 그대로 띄운다.
 *
 * 지우기 전에 무엇이 벌어지는지 보여 주는 것이 이 기능의 핵심이라, 0건인
 * 항목은 빼서 실제로 일어나는 일만 남긴다. 아무 일도 없으면 빈 배열이다.
 */
export function describeMenteeDeletion(preview: MenteeDeletionPreview): string[] {
    const lines: string[] = [];

    for (const project of preview.transferProjects) {
        // User.name 은 nullable 이고 공백만 들어올 수도 있다. 어느 쪽이든 사람 이름
        // 자리가 비면 "소유자가  로 바뀝니다" 가 되므로 역할 이름으로 대신한다.
        const managerName = project.managerName?.trim() || '프로그램 매니저';
        lines.push(`프로젝트 "${project.name}" 의 소유자가 ${managerName} 로 바뀝니다.`);
    }
    if (preview.invitations > 0) {
        lines.push(`설문 초대 ${preview.invitations}건은 남고 발송자만 비워집니다.`);
    }
    if (preview.migrations > 0) {
        lines.push(`엑셀 가져오기 이력 ${preview.migrations}건은 남고 가져온 사람만 비워집니다.`);
    }
    if (preview.inviteCodes > 0) {
        lines.push(`이 사람에게 발급된 초대 코드 ${preview.inviteCodes}건은 함께 삭제됩니다.`);
    }

    return lines;
}
