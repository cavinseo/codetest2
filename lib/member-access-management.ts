// 회원 이용만료일을 초대 코드 기한과 대조하고 동시 변경을 보호하며 저장한다.
import { prisma } from './prisma';

export async function setMemberAccessExpiry(userId: string, email: string, accessExpiresAt: Date) {
    return prisma.$transaction(async (tx) => {
        // 초대 연장·최초 로그인과 같은 이메일 잠금을 사용해 두 기한의 역전을 막는다.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-email:${email.trim().toLowerCase()}`}))::text`;
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        const member = await tx.user.findUnique({ where: { id: userId } });
        if (!member) return { error: '사용자를 찾을 수 없습니다.', status: 404 };

        if (member.role === 'MENTEE') {
            const invite = await tx.inviteCode.findFirst({
                where: {
                    role: 'MENTEE',
                    OR: [
                        { usedById: userId },
                        { usedAt: null, programId: member.programId ?? undefined,
                            email: { equals: member.email, mode: 'insensitive' } },
                    ],
                },
                orderBy: { expiresAt: 'desc' }, select: { expiresAt: true },
            });
            if (invite && accessExpiresAt < invite.expiresAt) {
                return { error: '이용만료일은 초대 코드의 최초 접속 기한보다 빠를 수 없습니다.', status: 400 };
            }
        }

        const shortened = !member.accessExpiresAt || accessExpiresAt < member.accessExpiresAt;
        const updated = await tx.user.updateMany({
            where: { id: userId, accessExpiresAt: member.accessExpiresAt },
            data: { accessExpiresAt, ...(shortened ? { sessionVersion: { increment: 1 } } : {}) },
        });
        if (updated.count !== 1) return { error: '이용 기한이 변경되었습니다. 새로고침 후 다시 시도하세요.', status: 409 };
        return { user: { id: userId, email: member.email, accessExpiresAt } };
    });
}
