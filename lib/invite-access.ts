// 최초 접속은 초대 기한으로, 가입 후 이용은 회원 이용만료일로 판정한다.
import { isAccessExpired } from './member-roles';

interface InviteAccess {
    usedAt: Date | null;
    expiresAt: Date;
    accessExpiresAt?: Date | null;
    accessDurationDays: number;
    program: { endsAt: Date };
    usedBy?: { accessExpiresAt: Date | null } | null;
}

export function inviteAccessExpiresAt(invite: InviteAccess): Date {
    const savedAccessExpiry = invite.usedBy?.accessExpiresAt ?? invite.accessExpiresAt;
    if (invite.usedAt && savedAccessExpiry) {
        return savedAccessExpiry;
    }
    const deadlines = [invite.program.endsAt.getTime()];
    if (invite.usedAt) {
        // 명시된 이용만료일이 없는 구형 계정만 기존 기간 규칙을 적용한다.
        deadlines.push(invite.usedAt.getTime() + invite.accessDurationDays * 86_400_000);
    } else {
        deadlines.push(invite.expiresAt.getTime());
    }
    return new Date(Math.min(...deadlines));
}

export function isUserAccessExpired(user: {
    accessExpiresAt: Date | null;
    programId?: string | null;
    usedInviteCode?: (Omit<InviteAccess, 'usedBy'> & { programId: string }) | null;
}, now: Date = new Date()): boolean {
    if (isAccessExpired(user.accessExpiresAt, now)) return true;
    const invite = user.usedInviteCode;
    if (!invite) return false;
    if (user.programId !== invite.programId || !invite.usedAt) return true;
    return inviteAccessExpiresAt({ ...invite, usedBy: user }).getTime() <= now.getTime();
}
