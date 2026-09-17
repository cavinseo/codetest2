// 초대 발급과 기한 연장의 검증·저장을 트랜잭션 안에서 처리한다.
import type { Prisma, User } from '@prisma/client';
import { prisma } from './prisma';
import { generateId } from './id';
import { canManageThisProgram } from './program';
import type { InvitableRole, MemberRole } from './member-roles';
import { inviteAccessExpiresAt } from './invite-access';
import { formatInviteExpiryDate } from './invite-expiry';

type InviteManager = { role: MemberRole; userId: string };
type InviteValidationError = { error: string; status: number };
type InviteWithMentee = Prisma.InviteCodeGetPayload<{ include: { program: true; usedBy: true } }>;

interface IssueInviteInput {
    email: string;
    code: string;
    role: InvitableRole;
    programId: string;
    expiresAt: Date;
    accessDurationDays: number;
}

function resolveInviteExpiry(requestedExpiresAt: Date, programEndsAt: Date, now: Date): { expiresAt: Date } | InviteValidationError {
    if (programEndsAt <= now) return { error: '종료된 프로그램의 초대 기한은 지정할 수 없습니다.', status: 400 };
    if (requestedExpiresAt <= now) return { error: '최초 접속 기한은 오늘 이후 날짜로 입력하세요.', status: 400 };
    if (formatInviteExpiryDate(requestedExpiresAt) > formatInviteExpiryDate(programEndsAt)) {
        return { error: '최초 접속 기한은 프로그램 종료일을 넘길 수 없습니다.', status: 400 };
    }
    return { expiresAt: new Date(Math.min(requestedExpiresAt.getTime(), programEndsAt.getTime())) };
}

function lockInviteEmail(tx: Prisma.TransactionClient, email: string) {
    // 프로그램이 달라도 같은 이메일의 발급·연장을 직렬화한다.
    return tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-email:${email}`}))::text`;
}

async function hasActiveInviteForEmail(tx: Prisma.TransactionClient, email: string, now: Date, excludedInviteId?: string) {
    const invites = await tx.inviteCode.findMany({
        where: {
            ...(excludedInviteId ? { id: { not: excludedInviteId } } : {}),
            email: { equals: email, mode: 'insensitive' },
        },
        include: { program: { select: { endsAt: true } }, usedBy: { select: { accessExpiresAt: true } } },
    });
    return invites.some((invite) => inviteAccessExpiresAt(invite) > now);
}

export async function issueMenteeInvite(input: IssueInviteInput, manager: InviteManager) {
    return prisma.$transaction(async (tx) => {
        await lockInviteEmail(tx, input.email);
        const program = await tx.program.findUnique({
            where: { id: input.programId }, select: { id: true, managerId: true, endsAt: true },
        });
        if (!program) return { error: '프로그램을 찾을 수 없습니다.', status: 404 };
        if (!canManageThisProgram(manager, program)) {
            return { error: '이 프로그램에 초대 코드를 발행할 권한이 없습니다.', status: 403 };
        }
        const now = new Date();
        const expiry = resolveInviteExpiry(input.expiresAt, program.endsAt, now);
        if ('error' in expiry) return expiry;
        const existingAccount = await tx.user.findFirst({
            where: { email: { equals: input.email, mode: 'insensitive' } }, select: { id: true },
        });
        if (existingAccount) return { error: '이미 가입된 이메일입니다.', status: 409 };
        if (await hasActiveInviteForEmail(tx, input.email, now)) {
            return { error: '이미 발행된 유효한 초대 코드가 있습니다.', status: 409 };
        }
        const invite = await tx.inviteCode.create({ data: {
            id: generateId('invite'),
            code: input.code,
            email: input.email,
            role: input.role,
            programId: program.id,
            expiresAt: expiry.expiresAt,
            accessExpiresAt: expiry.expiresAt,
            accessDurationDays: input.accessDurationDays,
            issuedById: manager.userId,
        } });
        return { invite };
    });
}

async function findMenteeForExtension(tx: Prisma.TransactionClient, invite: InviteWithMentee, email: string, now: Date):
    Promise<{ mentee: User | null; existingAccessExpiresAt?: Date | null } | InviteValidationError> {
    if (invite.usedAt || invite.usedById) return { mentee: invite.usedBy };
    if (await hasActiveInviteForEmail(tx, email, now, invite.id)) {
        return { error: '이미 발행된 다른 유효한 초대 코드가 있습니다.', status: 409 };
    }
    const existingMentee = await tx.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        include: { usedInviteCode: { select: { id: true } } },
    });
    if (existingMentee?.usedInviteCode) {
        return { error: '이 멘티는 다른 초대 코드에 연결되어 있습니다.', status: 409 };
    }
    // 날짜 편집으로 계정을 승인하거나 연결하지 않는다. 만료 초대도 연결 전에 연장할 수 있다.
    return { mentee: null, existingAccessExpiresAt: existingMentee?.accessExpiresAt };
}

async function updateMenteeExpiry(
    tx: Prisma.TransactionClient, invite: InviteWithMentee, mentee: User | null,
    email: string, expiresAt: Date,
): Promise<InviteValidationError | null> {
    if (!invite.usedAt && !invite.usedById) return null;
    if (!mentee || mentee.id !== invite.usedById || mentee.role !== 'MENTEE' || mentee.isAdmin || mentee.status !== 'APPROVED'
        || mentee.programId !== invite.programId || mentee.email.trim().toLowerCase() !== email) {
        return { error: '초대와 같은 프로그램의 승인된 멘티인지 확인하세요.', status: invite.usedAt ? 400 : 409 };
    }
    const accessExpiresAt = mentee.accessExpiresAt ?? (invite.usedAt ? inviteAccessExpiresAt(invite) : expiresAt);
    if (expiresAt > accessExpiresAt) {
        return { error: '초대 기한은 회원 이용만료일보다 늦을 수 없습니다. 회원관리에서 이용만료일을 먼저 연장하세요.', status: 400 };
    }
    const updatedMentees = await tx.user.updateMany({
        where: { id: mentee.id, role: 'MENTEE', isAdmin: false, status: 'APPROVED', programId: invite.programId,
            email: { equals: email, mode: 'insensitive' }, accessExpiresAt: mentee.accessExpiresAt },
        data: { accessExpiresAt },
    });
    if (updatedMentees.count !== 1) return { error: '멘티 정보가 변경되었습니다. 목록을 새로고침하세요.', status: 409 };
    return null;
}

export async function extendMenteeInvite(inviteId: string, requestedExpiresAt: Date, manager: InviteManager) {
    const inviteEmail = await prisma.inviteCode.findUnique({ where: { id: inviteId }, select: { email: true } });
    if (!inviteEmail) return { error: '초대 코드를 찾을 수 없습니다.', status: 404 };
    const email = inviteEmail.email.trim().toLowerCase();

    return prisma.$transaction(async (tx) => {
        await lockInviteEmail(tx, email);
        await tx.$queryRaw`SELECT id FROM users WHERE lower(email) = ${email} ORDER BY id FOR UPDATE`;
        // 첫 로그인과 경합해도 변경된 초대와 회원 기한을 함께 검증한다.
        await tx.$queryRaw`SELECT id FROM invite_codes WHERE id = ${inviteId} FOR UPDATE`;
        const invite = await tx.inviteCode.findUnique({
            where: { id: inviteId }, include: { program: true, usedBy: true },
        });
        if (!invite) return { error: '초대 코드를 찾을 수 없습니다.', status: 404 };
        if (!canManageThisProgram(manager, invite.program)) {
            return { error: '이 초대 기한을 변경할 권한이 없습니다.', status: 403 };
        }
        if (invite.role !== 'MENTEE') return { error: '멘티 초대 코드만 연장할 수 있습니다.', status: 400 };
        const now = new Date();
        const expiry = resolveInviteExpiry(requestedExpiresAt, invite.program.endsAt, now);
        if ('error' in expiry) return expiry;
        const { expiresAt } = expiry;
        if (expiresAt <= invite.expiresAt) {
            return { error: '현재 기한보다 늦은 날짜를 선택하세요.', status: 400 };
        }

        const account = await findMenteeForExtension(tx, invite, email, now);
        if ('error' in account) return account;
        if (account.existingAccessExpiresAt && expiresAt > account.existingAccessExpiresAt) {
            return { error: '초대 기한은 회원 이용만료일보다 늦을 수 없습니다. 회원관리에서 이용만료일을 먼저 연장하세요.', status: 400 };
        }
        const { mentee } = account;
        const updateError = await updateMenteeExpiry(tx, invite, mentee, email, expiresAt);
        if (updateError) return updateError;

        const initialAccessExpiry = mentee?.accessExpiresAt ?? new Date(Math.max(
            expiresAt.getTime(), invite.accessExpiresAt?.getTime() ?? 0,
        ));
        await tx.inviteCode.update({ where: { id: invite.id }, data: {
            expiresAt,
            ...(!invite.usedAt ? { accessExpiresAt: initialAccessExpiry } : {}),
        } });
        return { invite: { id: invite.id, expiresAt, usedAt: invite.usedAt } };
    });
}
