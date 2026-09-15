// 멘티의 이메일과 개인 초대 코드로 계정 연결 및 반복 로그인을 처리한다.
import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { encodeSessionCookie } from '@/lib/auth';
import { BCRYPT_ROUNDS, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/constants';
import { normalizeInviteCode } from '@/lib/invite-code';
import { inviteAccessExpiresAt } from '@/lib/invite-access';
import { isProfileCompleteForRole } from '@/lib/member-profile';
import { LOGIN_RATE_LIMIT, clientIpFrom, consumeRateLimit, resetRateLimit } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import { errorCodeOf } from '@/lib/api-error';

const log = createLogger('api/auth/invite-login');
const schema = z.object({
    email: z.string().trim().email('유효한 이메일을 입력하세요.').transform((value) => value.toLowerCase()),
    inviteCode: z.string().trim().min(1, '초대 코드를 입력하세요.').max(100),
});
class InviteLoginDenied extends Error {}
const denied = () => NextResponse.json({ error: '이메일과 초대 코드를 확인하세요. 이용 기한이 만료되었거나 사용할 수 없는 코드입니다.' }, { status: 403 });

export async function POST(request: NextRequest) {
    try {
        const { email, inviteCode } = schema.parse(await request.json());
        const rateKey = `invite-login:${clientIpFrom(request.headers)}:${email}`;
        const limit = consumeRateLimit(rateKey, LOGIN_RATE_LIMIT);
        if (!limit.allowed) {
            return NextResponse.json({ error: `로그인 시도가 너무 많습니다. ${limit.retryAfterSeconds}초 후 다시 시도하세요.` }, {
                status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) },
            });
        }

        const code = normalizeInviteCode(inviteCode);
        const user = await prisma.$transaction(async (tx) => {
            // 최초 로그인과 기존 가입 경로가 같은 코드를 동시에 연결하지 못하게 한다.
            await tx.$queryRaw`SELECT id FROM invite_codes WHERE code = ${code} FOR UPDATE`;
            const invite = await tx.inviteCode.findUnique({ where: { code }, include: { program: true, usedBy: true } });
            const now = new Date();
            if (!invite || invite.role !== 'MENTEE' || invite.email.trim().toLowerCase() !== email
                || inviteAccessExpiresAt(invite).getTime() <= now.getTime()) throw new InviteLoginDenied();

            if (invite.usedAt) {
                const linked = invite.usedBy;
                if (!linked || linked.id !== invite.usedById || linked.email.trim().toLowerCase() !== email
                    || linked.role !== 'MENTEE' || linked.isAdmin || linked.status !== 'APPROVED'
                    || linked.programId !== invite.programId) throw new InviteLoginDenied();
                return linked;
            }
            if (invite.usedById) throw new InviteLoginDenied();
            const existing = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
            if (existing) throw new InviteLoginDenied();

            const created = await tx.user.create({ data: {
                id: generateId('user'), email, name: null,
                // 사용자가 알 수 없는 임의 비밀번호로 비밀번호 인증을 사용할 수 없게 한다.
                passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS),
                role: 'MENTEE', status: 'APPROVED', mustChangePassword: false,
                programId: invite.programId,
                accessExpiresAt: inviteAccessExpiresAt({ ...invite, usedAt: now }),
            } });
            const marked = await tx.inviteCode.updateMany({
                where: { id: invite.id, usedAt: null, usedById: null },
                data: { usedAt: now, usedById: created.id },
            });
            if (marked.count !== 1) throw new InviteLoginDenied();
            return created;
        });

        const profile = await prisma.memberProfile.findUnique({ where: { userId: user.id } });
        const cookieStore = await cookies();
        cookieStore.set(SESSION_COOKIE_NAME, encodeSessionCookie({ userId: user.id, email: user.email, name: user.name }, {
            sessionVersion: user.sessionVersion,
        }), {
            httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production',
            maxAge: SESSION_MAX_AGE_SECONDS, path: '/',
        });
        resetRateLimit(rateKey);
        return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name },
            mustChangePassword: user.mustChangePassword, needsProfile: !isProfileCompleteForRole('MENTEE', profile) });
    } catch (error) {
        if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        if (error instanceof InviteLoginDenied || errorCodeOf(error) === 'P2002') return denied();
        // DB 예외 본문에 코드나 이메일이 포함될 수 있으므로 원문을 남기지 않는다.
        log.error('초대 코드 로그인 실패', undefined, { code: errorCodeOf(error) ?? undefined });
        return NextResponse.json({ error: '로그인 중 오류가 발생했습니다.' }, { status: 500 });
    }
}
