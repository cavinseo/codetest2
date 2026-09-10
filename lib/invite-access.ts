// 초대 코드의 최초 사용과 프로그램 종료를 모든 인증 경로에서 동일하게 판정한다.
import { DEFAULT_ACCESS_DURATION_DAYS, isAccessExpired } from './member-roles';

interface InviteAccess {
    usedAt: Date | null;
    expiresAt: Date;
    program: { endsAt: Date };
    usedBy?: { accessExpiresAt: Date | null } | null;
}

export function inviteAccessExpiresAt(invite: InviteAccess): Date {
    const deadlines = [invite.program.endsAt.getTime()];
    if (invite.usedAt) {
        deadlines.push(invite.usedAt.getTime() + DEFAULT_ACCESS_DURATION_DAYS * 86_400_000);
        if (invite.usedBy?.accessExpiresAt) deadlines.push(invite.usedBy.accessExpiresAt.getTime());
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
