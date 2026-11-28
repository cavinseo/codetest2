// 최초 접속은 초대 기한으로, 가입 후 이용은 회원 이용만료일로 판정한다.
import { isAccessExpired } from './member-roles';
import { programEndDeadline } from './program';

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
    // 프로그램은 종료일 한국 시간 끝까지 유효하다. 예전에 UTC 자정으로 저장된 종료일도
    // 여기서 그날 끝으로 맞춰 오전 9시에 막히지 않게 한다(감리 B8).
    const deadlines = [programEndDeadline(invite.program.endsAt).getTime()];
    if (invite.usedAt) {
        // 이용만료일이 저장되지 않은 코드는 첫 로그인 시점부터 기간을 센다.
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
