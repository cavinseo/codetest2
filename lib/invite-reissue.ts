// 유출된 멘티 초대 코드를 새 값으로 바꾸고, 연결된 회원의 자격을 함께 돌린다.
//
// 초대 코드는 가입 후에도 로그인 수단이고, 그 세션에서 기존 비밀번호 없이 새
// 비밀번호를 정할 수 있다. 비밀번호와 같은 값인데 바꿀 방법이 없으면, 초대
// 메일이 전달·유출됐을 때 대응 수단이 회원 삭제뿐이다.
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { BCRYPT_ROUNDS } from './constants';
import { errorCodeOf } from './api-error';
import { generateInviteCode } from './invite-code';
import { inviteAccessExpiresAt } from './invite-access';
import { canManageThisProgram } from './program';
import type { MemberRole } from './member-roles';

type InviteManager = { role: MemberRole; userId: string };

export interface ReissuedInvite {
    id: string;
    email: string;
    code: string;
    programName: string;
    expiresAt: Date;
    /** 지금부터 이 코드로 로그인할 수 있는 마지막 시각. */
    loginExpiresAt: Date;
    usedAt: Date | null;
    /** 연결된 회원의 세션·비밀번호를 함께 무효화했는가. */
    memberCredentialsRotated: boolean;
}

export type ReissueResult = { invite: ReissuedInvite } | { error: string; status: number };

const CHANGED_MSG = '초대 정보가 변경되었습니다. 목록을 새로고침한 뒤 다시 시도하세요.';

export async function reissueMenteeInvite(inviteId: string, manager: InviteManager): Promise<ReissueResult> {
    const found = await prisma.inviteCode.findUnique({ where: { id: inviteId }, select: { email: true } });
    if (!found) return { error: '초대 코드를 찾을 수 없습니다.', status: 404 };
    const email = found.email.trim().toLowerCase();

    try {
        return await prisma.$transaction(async (tx): Promise<ReissueResult> => {
            // 첫 로그인·기한 연장·회원 연결과 같은 순서로 잠가, 재발급 도중 옛 코드로
            // 계정이 만들어지거나 연결되는 일을 막는다.
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-email:${email}`}))::text`;
            await tx.$queryRaw`SELECT id FROM users WHERE lower(email) = ${email} ORDER BY id FOR UPDATE`;
            await tx.$queryRaw`SELECT id FROM invite_codes WHERE id = ${inviteId} FOR UPDATE`;

            const invite = await tx.inviteCode.findUnique({
                where: { id: inviteId }, include: { program: true, usedBy: true },
            });
            if (!invite) return { error: '초대 코드를 찾을 수 없습니다.', status: 404 };
            if (!canManageThisProgram(manager, invite.program)) {
                return { error: '이 프로그램의 초대 코드를 재발급할 권한이 없습니다.', status: 403 };
            }
            const loginExpiresAt = inviteAccessExpiresAt(invite);
            if (invite.role !== 'MENTEE' || loginExpiresAt.getTime() <= Date.now()) {
                return { error: '만료되었거나 사용할 수 없는 멘티 초대 코드입니다. 기한을 먼저 연장하세요.', status: 400 };
            }

            const member = invite.usedBy;
            if (invite.usedAt || invite.usedById) {
                // 어긋난 연결에 새 코드를 내주면 엉뚱한 계정의 로그인 수단을 만들게 된다.
                if (!member || member.id !== invite.usedById || member.email.trim().toLowerCase() !== email
                    || member.role !== 'MENTEE' || member.isAdmin || member.status !== 'APPROVED'
                    || member.programId !== invite.programId) {
                    return { error: '초대 코드와 멘티의 등록 정보가 일치하지 않아 재발급할 수 없습니다.', status: 409 };
                }
            }

            const code = generateInviteCode();
            // 조회한 코드가 그대로일 때만 바꾼다. 잠금을 건너뛴 경로가 생겨도
            // 두 재발급이 서로의 결과를 덮지 않는다.
            const replaced = await tx.inviteCode.updateMany({
                where: { id: invite.id, code: invite.code }, data: { code },
            });
            if (replaced.count !== 1) return { error: CHANGED_MSG, status: 409 };

            if (member) {
                // 옛 코드로 로그인한 제3자의 세션과, 그 세션에서 정해 둔 비밀번호를
                // 함께 끊는다. 코드만 바꾸면 이미 넘어간 계정은 그대로 남는다.
                await tx.user.update({
                    where: { id: member.id },
                    data: {
                        passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS),
                        sessionVersion: { increment: 1 },
                    },
                });
            }

            return {
                invite: {
                    id: invite.id, email, code, programName: invite.program.name,
                    expiresAt: invite.expiresAt, loginExpiresAt, usedAt: invite.usedAt,
                    memberCredentialsRotated: Boolean(member),
                },
            };
        });
    } catch (error) {
        // 새 코드가 기존 코드와 겹친 경우다(59비트라 사실상 일어나지 않는다).
        if (errorCodeOf(error) === 'P2002') return { error: '재발급에 실패했습니다. 다시 시도하세요.', status: 409 };
        throw error;
    }
}
