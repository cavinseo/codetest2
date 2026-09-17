// 초대 발급과 기한 연장의 검증·계정 연결·저장을 트랜잭션 안에서 처리한다.
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
    if (requestedExpiresAt <= now) return { error: '이용 기한은 오늘 이후 날짜로 입력하세요.', status: 400 };
    if (formatInviteExpiryDate(requestedExpiresAt) > formatInviteExpiryDate(programEndsAt)) {
        return { error: '이용 기한은 프로그램 종료일을 넘길 수 없습니다.', status: 400 };
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
    Promise<{ mentee: User | null; shouldLinkExistingMentee: boolean } | InviteValidationError> {
    if (invite.usedAt) return { mentee: invite.usedBy, shouldLinkExistingMentee: false };
    if (invite.usedById) return { error: '초대 코드에 연결된 멘티 정보를 확인하세요.', status: 400 };
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
    // 기존 가입 경로로 등록되어 초대 연결이 없는 승인 멘티도 같은 기한을 적용한다.
    return { mentee: existingMentee, shouldLinkExistingMentee: !!existingMentee };
}

async function updateMenteeExpiry(
    tx: Prisma.TransactionClient, invite: InviteWithMentee, mentee: User | null,
    email: string, expiresAt: Date, shouldLinkExistingMentee: boolean,
): Promise<InviteValidationError | null> {
    if (!invite.usedAt && !mentee) return null;
    if (!mentee || (invite.usedAt && mentee.id !== invite.usedById) || mentee.role !== 'MENTEE' || mentee.isAdmin || mentee.status !== 'APPROVED'
        || mentee.programId !== invite.programId || mentee.email.trim().toLowerCase() !== email) {
        return { error: '초대와 같은 프로그램의 승인된 멘티인지 확인하세요.', status: invite.usedAt ? 400 : 409 };
    }
    if (shouldLinkExistingMentee && mentee.accessExpiresAt && expiresAt < mentee.accessExpiresAt) {
        return { error: '현재 멘티 이용 기한보다 이른 날짜로 변경할 수 없습니다.', status: 400 };
    }
    const updatedMentees = await tx.user.updateMany({
        where: { id: mentee.id, role: 'MENTEE', isAdmin: false, status: 'APPROVED', programId: invite.programId,
            email: { equals: email, mode: 'insensitive' }, accessExpiresAt: mentee.accessExpiresAt,
            ...(shouldLinkExistingMentee ? { usedInviteCode: { is: null } } : {}) },
        data: { accessExpiresAt: expiresAt },
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
        // 첫 로그인과 경합해도 연결된 계정의 기한까지 한 번에 연장한다.
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
        if (expiresAt <= inviteAccessExpiresAt(invite)) {
            return { error: '현재 기한보다 늦은 날짜를 선택하세요.', status: 400 };
        }

        const account = await findMenteeForExtension(tx, invite, email, now);
        if ('error' in account) return account;
        const { mentee, shouldLinkExistingMentee } = account;
        const updateError = await updateMenteeExpiry(tx, invite, mentee, email, expiresAt, shouldLinkExistingMentee);
        if (updateError) return updateError;

        await tx.inviteCode.update({ where: { id: invite.id }, data: {
            expiresAt, accessExpiresAt: expiresAt,
            ...(shouldLinkExistingMentee && mentee ? { usedAt: now, usedById: mentee.id } : {}),
        } });
        return { invite: { id: invite.id, expiresAt, usedAt: shouldLinkExistingMentee ? now : invite.usedAt } };
    });
}
