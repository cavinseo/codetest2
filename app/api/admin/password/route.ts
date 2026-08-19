import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { BCRYPT_ROUNDS } from '@/lib/constants';
import { createLogger } from '@/lib/logger';
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

        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS) },
        });

        log.info('비밀번호 변경 완료', { userId: user.id });
        return NextResponse.json({ success: true, message: '비밀번호를 변경했습니다.' });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('비밀번호 변경 중 오류', error);
        return NextResponse.json({ error: '비밀번호 변경에 실패했습니다.' }, { status: 500 });
    }
}
