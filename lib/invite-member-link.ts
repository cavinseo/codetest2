// 관리자가 기존 멘티를 초대에 연결하기 전에 영향과 최신 상태를 검증한다.
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { BCRYPT_ROUNDS } from './constants';
import { inviteAccessExpiresAt } from './invite-access';

export class InviteMemberLinkError extends Error {
    constructor(message: string, public readonly status: number) { super(message); }
}

const CONFLICT = '회원 또는 초대 정보가 변경되었습니다. 연결 내용을 다시 확인하세요.';

async function readLinkState(tx: Prisma.TransactionClient, inviteId: string) {
    const invite = await tx.inviteCode.findUnique({ where: { id: inviteId }, include: { program: true } });
    if (!invite) throw new InviteMemberLinkError('초대 코드를 찾을 수 없습니다.', 404);
    const email = invite.email.trim().toLowerCase();
    const member = await tx.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        include: { program: { select: { name: true } }, usedInviteCode: { select: { id: true } } },
    });
    const otherInvites = await tx.inviteCode.findMany({
        where: { id: { not: inviteId }, email: { equals: email, mode: 'insensitive' } },
        include: { program: { select: { endsAt: true } }, usedBy: { select: { accessExpiresAt: true } } },
    });
    return { invite, email, member, otherInvites };
}

function buildLinkPreview({ invite, email, member, otherInvites }: Awaited<ReturnType<typeof readLinkState>>) {
    const now = new Date();
    if (invite.role !== 'MENTEE' || invite.usedAt || invite.usedById) {
        throw new InviteMemberLinkError('아직 연결되지 않은 미사용 멘티 초대만 연결할 수 있습니다.', 409);
    }
    if (inviteAccessExpiresAt(invite) <= now) {
        throw new InviteMemberLinkError('최초 접속 기한이 지났습니다. 초대 기한을 먼저 연장하세요.', 400);
    }
    if (!member) throw new InviteMemberLinkError('이 이메일로 가입한 회원이 없습니다. 초대 코드로 처음 로그인하면 가입됩니다.', 404);
    if (member.role !== 'MENTEE' || member.isAdmin || !['PENDING', 'APPROVED'].includes(member.status)) {
        throw new InviteMemberLinkError('승인 대기 또는 승인된 일반 멘티만 연결할 수 있습니다.', 409);
    }
    if (member.programId && member.programId !== invite.programId) {
        throw new InviteMemberLinkError('다른 프로그램에 소속된 회원은 연결할 수 없습니다.', 409);
    }
    if (member.usedInviteCode || otherInvites.some((other) => inviteAccessExpiresAt(other) > now)) {
        throw new InviteMemberLinkError('다른 초대 코드가 연결되어 있거나 유효합니다. 초대 정보를 먼저 정리하세요.', 409);
    }
    const accessExpiresAt = member.accessExpiresAt ?? new Date(Math.max(
        invite.expiresAt.getTime(), invite.accessExpiresAt?.getTime() ?? 0,
    ));
    if (accessExpiresAt < invite.expiresAt) {
        throw new InviteMemberLinkError('초대 기한은 회원 이용만료일보다 늦을 수 없습니다. 회원관리에서 이용만료일을 먼저 연장하세요.', 400);
    }
    const snapshot = {
        inviteId: invite.id, email, programId: invite.programId, programEndsAt: invite.program.endsAt,
        expiresAt: invite.expiresAt, initialAccessExpiresAt: invite.accessExpiresAt,
        memberId: member.id, updatedAt: member.updatedAt, status: member.status, role: member.role,
        isAdmin: member.isAdmin, memberProgramId: member.programId, accessExpiresAt: member.accessExpiresAt,
        sessionVersion: member.sessionVersion, mustChangePassword: member.mustChangePassword,
    };
    return {
        inviteId: invite.id, email,
        member: { id: member.id, name: member.name, status: member.status,
            programName: member.program?.name ?? null, accessExpiresAt: member.accessExpiresAt?.toISOString() ?? null },
        program: { id: invite.programId, name: invite.program.name },
        inviteExpiresAt: invite.expiresAt.toISOString(), accessExpiresAt: accessExpiresAt.toISOString(),
        resetPassword: member.status === 'PENDING',
        previewToken: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
    };
}

export async function getInviteMemberLinkPreview(inviteId: string) {
    return prisma.$transaction(async (tx) => buildLinkPreview(await readLinkState(tx, inviteId)));
}

export async function linkInviteMember(inviteId: string, memberId: string, previewToken: string) {
    return prisma.$transaction(async (tx) => {
        const initial = await readLinkState(tx, inviteId);
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-email:${initial.email}`}))::text`;
        // 회원 배정·삭제와 같은 회원→초대 순서로 잠가 교착을 피한다.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${memberId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM invite_codes WHERE id = ${inviteId} FOR UPDATE`;
        const state = await readLinkState(tx, inviteId);
        if (state.email !== initial.email || state.member?.id !== memberId) throw new InviteMemberLinkError(CONFLICT, 409);
        const preview = buildLinkPreview(state);
        if (preview.previewToken !== previewToken) throw new InviteMemberLinkError(CONFLICT, 409);
        const member = state.member!;
        const passwordHash = preview.resetPassword
            ? await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS) : undefined;
        const updated = await tx.user.updateMany({
            where: { id: memberId, updatedAt: member.updatedAt, status: member.status, role: 'MENTEE', isAdmin: false,
                programId: member.programId, accessExpiresAt: member.accessExpiresAt, usedInviteCode: { is: null } },
            data: { status: 'APPROVED', programId: state.invite.programId, accessExpiresAt: new Date(preview.accessExpiresAt),
                sessionVersion: { increment: 1 },
                ...(preview.resetPassword ? { passwordHash, mustChangePassword: true } : {}) },
        });
        if (updated.count !== 1) throw new InviteMemberLinkError(CONFLICT, 409);
        const linked = await tx.inviteCode.updateMany({
            where: { id: inviteId, usedAt: null, usedById: null },
            data: { usedById: memberId, accessExpiresAt: new Date(preview.accessExpiresAt) },
        });
        if (linked.count !== 1) throw new InviteMemberLinkError(CONFLICT, 409);
        return preview;
    });
}
