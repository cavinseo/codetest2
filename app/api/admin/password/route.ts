import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { BCRYPT_ROUNDS, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/constants';
import { createLogger } from '@/lib/logger';
import { encodeSessionCookie, requireAuth, verifySessionCookie } from '@/lib/auth';
import { PASSWORD_MIN_LENGTH, getNewPasswordError, getPasswordChangeError } from '@/lib/password-policy';
import { normalizeInviteCode } from '@/lib/invite-code';
import { inviteAccessExpiresAt, isUserAccessExpired } from '@/lib/invite-access';
import { LOGIN_RATE_LIMIT, clientIpFrom, consumeRateLimit, resetRateLimit } from '@/lib/rate-limit';
import { errorCodeOf } from '@/lib/api-error';

const log = createLogger('api/admin/password');

// userId 를 받지 않는다. 로그인한 본인의 비밀번호만 바꿀 수 있어야
// 관리자 세션을 탈취해도 다른 계정을 넘겨받지 못한다.
const changePasswordSchema = z.object({
    verificationMethod: z.enum(['password', 'invite']).default('password'),
    currentPassword: z.string().optional().default(''),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH, `새 비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`),
    confirmPassword: z.string().min(1, '새 비밀번호 확인을 입력하세요.'),
    inviteCode: z.string().trim().max(100).optional().default(''),
});

export async function POST(request: NextRequest) {
    // 본인 비밀번호 변경은 관리자 전용이 아니다. 관리자가 만든 회원이 메일로 받은
    // 임시 비밀번호를 스스로 바꿀 수 있어야 하므로 requireAuth 로 연다.
    // 온보딩 게이트도 열어 둔다 — 이 경로가 막히면 임시 비밀번호를 바꿀 수 없다.
    const authResult = await requireAuth(request, { allowIncompleteOnboarding: true });
    if (authResult instanceof NextResponse) return authResult;

    try {
        const body = await request.json().catch(() => ({}));
        const input = changePasswordSchema.parse(body);

        const useInvite = input.verificationMethod === 'invite';
        if ((useInvite && input.currentPassword) || (!useInvite && input.inviteCode)) {
            return NextResponse.json({ error: '선택한 확인 방식의 정보만 입력하세요.' }, { status: 400 });
        }
        if (useInvite && !input.inviteCode) {
            return NextResponse.json({ error: '초대 코드를 입력하세요.' }, { status: 400 });
        }
        const policyError = useInvite ? getNewPasswordError(input) : getPasswordChangeError(input);
        if (policyError) {
            return NextResponse.json({ error: policyError }, { status: 400 });
        }

        const rateKey = `password-change:${authResult.userId}:${clientIpFrom(request.headers)}`;
        const limit = consumeRateLimit(rateKey, LOGIN_RATE_LIMIT);
        if (!limit.allowed) {
            return NextResponse.json({ error: `확인 시도가 너무 많습니다. ${limit.retryAfterSeconds}초 후 다시 시도하세요.` }, {
                status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) },
            });
        }

        // requireAuth 후에도 다른 요청이 비밀번호를 바꿀 수 있다. 서명된 요청 버전에 묶는다.
        const session = verifySessionCookie(request.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session || session.userId !== authResult.userId) {
            return NextResponse.json({ error: '세션이 만료되었습니다. 다시 로그인하세요.' }, { status: 401 });
        }
        const user = await prisma.user.findUnique({
            where: { id: authResult.userId },
            select: {
                id: true, email: true, name: true, passwordHash: true, sessionVersion: true,
                status: true, role: true, isAdmin: true, programId: true, accessExpiresAt: true,
                usedInviteCode: { select: {
                    id: true, code: true, email: true, role: true, usedAt: true, usedById: true,
                    expiresAt: true, accessExpiresAt: true, accessDurationDays: true, programId: true,
                    program: { select: { endsAt: true } },
                } },
            },
        });
        if (!user) {
            return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 });
        }

        if (user.sessionVersion !== session.ver) {
            return NextResponse.json({ error: '세션이 만료되었습니다. 다시 로그인하세요.' }, { status: 401 });
        }
        if (user.status !== 'APPROVED' || isUserAccessExpired(user)) {
            return NextResponse.json({ error: '현재 이용할 수 없는 계정입니다.' }, { status: 403 });
        }
        const invite = user.usedInviteCode;
        const canVerifyWithInviteCode = Boolean(invite && user.role === 'MENTEE' && !user.isAdmin
            && invite.role === 'MENTEE' && invite.usedAt && invite.usedById === user.id
            && invite.programId === user.programId
            && invite.email.trim().toLowerCase() === user.email.trim().toLowerCase()
            && inviteAccessExpiresAt({ ...invite, usedBy: user }).getTime() > Date.now());
        if (useInvite) {
            if (!invite || !canVerifyWithInviteCode || invite.code !== normalizeInviteCode(input.inviteCode)) {
                return NextResponse.json({ error: '초대 코드를 확인하세요. 이용 기한이 만료되었거나 사용할 수 없는 코드입니다.' }, { status: 403 });
            }
        } else if (!await bcrypt.compare(input.currentPassword, user.passwordHash)) {
            return NextResponse.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, { status: 400 });
        }

        const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
        if (isUserAccessExpired(user)) {
            return NextResponse.json({ error: '이용 기간이 만료되었습니다.' }, { status: 403 });
        }
        // 확인 방식과 무관하게 검증한 계정·초대 이용 기간이 그대로인 한 요청만 성공한다.
        const updated = await prisma.user.updateMany({
            where: {
                id: user.id, passwordHash: user.passwordHash, sessionVersion: session.ver, status: 'APPROVED',
                email: user.email, role: user.role, isAdmin: user.isAdmin,
                programId: user.programId, accessExpiresAt: user.accessExpiresAt,
                usedInviteCode: { is: invite ? {
                    id: invite.id, code: invite.code, email: invite.email, role: invite.role,
                    usedById: invite.usedById, usedAt: invite.usedAt, programId: invite.programId,
                    expiresAt: invite.expiresAt, accessExpiresAt: invite.accessExpiresAt, accessDurationDays: invite.accessDurationDays,
                    program: { is: { endsAt: invite.program.endsAt } },
                } : null },
            },
            data: {
                passwordHash,
                sessionVersion: { increment: 1 },
                // 임시 비밀번호를 실제로 바꿨으니 강제 변경 플래그를 내린다.
                mustChangePassword: false,
            },
        });
        if (updated.count !== 1) {
            return NextResponse.json({ error: '계정 정보가 변경되었습니다. 다시 로그인한 뒤 시도하세요.' }, { status: 409 });
        }

        // 다른 기기의 세션은 끊되, 지금 조작 중인 본인은 새 버전으로 재발급해 유지한다.
        const cookieStore = await cookies();
        cookieStore.set(
            SESSION_COOKIE_NAME,
            encodeSessionCookie(
                { userId: user.id, email: user.email, name: user.name },
                { sessionVersion: session.ver + 1 }
            ),
            {
                httpOnly: true,
                sameSite: 'strict',
                secure: process.env.NODE_ENV === 'production',
                maxAge: SESSION_MAX_AGE_SECONDS,
                path: '/',
            }
        );

        resetRateLimit(rateKey);
        log.info('비밀번호 변경 완료', { userId: user.id });
        return NextResponse.json({
            success: true,
            message: '비밀번호를 변경했습니다. 다른 기기의 로그인은 해제됩니다.'
                + (canVerifyWithInviteCode ? ' 초대 코드는 이용 기간 동안 로그인과 비밀번호 재설정에 계속 사용할 수 있습니다.' : ''),
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        // DB 예외에는 새 해시와 이메일이 포함될 수 있어 원문을 남기지 않는다.
        log.error('비밀번호 변경 중 오류', undefined, { code: errorCodeOf(error) ?? undefined });
        return NextResponse.json({ error: '비밀번호 변경에 실패했습니다.' }, { status: 500 });
    }
}
