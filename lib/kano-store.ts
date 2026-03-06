// Kano 초대 관련 공유 저장소
// globalThis를 사용하여 모듈 인스턴스 간 데이터 공유

export interface KanoInvitation {
    id: string;
    projectId: string;
    email: string;
    token: string;
    expiresAt: string;
    respondedAt?: string;
}

interface GlobalKanoStore {
    __kano_invitations: KanoInvitation[];
}

const g = globalThis as unknown as GlobalKanoStore;

if (!g.__kano_invitations) g.__kano_invitations = [];

export const kanoInvitations = g.__kano_invitations;

export function findKanoInvitation(token: string): KanoInvitation | undefined {
    return kanoInvitations.find((inv) => inv.token === token);
}

export function getProjectInvitations(projectId: string): KanoInvitation[] {
    return kanoInvitations.filter((inv) => inv.projectId === projectId);
}
