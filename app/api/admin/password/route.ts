import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { BCRYPT_ROUNDS, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/constants';
import { createLogger } from '@/lib/logger';
import { encodeSessionCookie } from '@/lib/auth';
import { requireAdmin } from '@/lib/authorization';
import { PASSWORD_MIN_LENGTH, getPasswordChangeError } from '@/lib/password-policy';

const log = createLogger('api/admin/password');

// userId 를 받지 않는다. 로그인한 본인의 비밀번호만 바꿀 수 있어야
// 관리자 세션을 탈취해도 다른 계정을 넘겨받지 못한다.
const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, '현재 비밀번호를 입력하세요.'),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH, `새 비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`),
    confirmPassword: z.string().min(1, '새 비밀번호 확인을 입력하세요.'),
});

export async function POST(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const body = await request.json().catch(() => ({}));
        const input = changePasswordSchema.parse(body);

        const policyError = getPasswordChangeError(input);
        if (policyError) {
            return NextResponse.json({ error: policyError }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { id: adminResult.userId },
            select: { id: true, passwordHash: true },
        });
        if (!user) {
            return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 });
        }

        // 세션만으로 바꾸지 못하게 현재 비밀번호를 반드시 확인한다.
        const isCurrentCorrect = await bcrypt.compare(input.currentPassword, user.passwordHash);
        if (!isCurrentCorrect) {
            log.warn('비밀번호 변경 실패 — 현재 비밀번호 불일치', { userId: user.id });
            return NextResponse.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, { status: 400 });
        }

        // sessionVersion 을 올려 기존에 발급된 세션을 전부 끊는다.
        // 비밀번호가 유출돼 바꾸는 상황이라면, 탈취된 쿠키가 계속 살아 있으면 의미가 없다.
        const updated = await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash: await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS),
                sessionVersion: { increment: 1 },
            },
            select: { id: true, email: true, name: true, sessionVersion: true },
        });

        // 다른 기기의 세션은 끊되, 지금 조작 중인 본인은 새 버전으로 재발급해 유지한다.
        const cookieStore = await cookies();
        cookieStore.set(
            SESSION_COOKIE_NAME,
            encodeSessionCookie(
                { userId: updated.id, email: updated.email, name: updated.name },
                { sessionVersion: updated.sessionVersion }
            ),
            {
                httpOnly: true,
                sameSite: 'strict',
                secure: process.env.NODE_ENV === 'production',
                maxAge: SESSION_MAX_AGE_SECONDS,
                path: '/',
            }
        );

        log.info('비밀번호 변경 완료', { userId: user.id });
        return NextResponse.json({
            success: true,
            message: '비밀번호를 변경했습니다. 다른 기기의 로그인은 해제됩니다.',
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('비밀번호 변경 중 오류', error);
        return NextResponse.json({ error: '비밀번호 변경에 실패했습니다.' }, { status: 500 });
    }
}
