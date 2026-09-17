// 초대 코드의 저장된 이용 기간과 프로그램 종료를 모든 인증 경로에서 동일하게 판정한다.
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
    const deadlines = [invite.program.endsAt.getTime()];
    if (invite.usedAt) {
        // 기존 계정은 관리자가 연장한 기한을 보존한다. 최초 생성 또는 기한이
        // 없는 계정만 초대에 저장된 기간을 사용하며, 프로그램 종료는 항상 적용한다.
        deadlines.push(invite.usedBy?.accessExpiresAt?.getTime()
            ?? invite.accessExpiresAt?.getTime()
            ?? invite.usedAt.getTime() + invite.accessDurationDays * 86_400_000);
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
