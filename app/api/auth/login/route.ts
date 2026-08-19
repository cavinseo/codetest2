import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/constants';
import { encodeSessionCookie } from '@/lib/auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/auth/login');

const INVALID_CREDENTIALS_MSG = '이메일 또는 비밀번호가 올바르지 않습니다.';

const loginSchema = z.object({
    email: z.string().email('유효한 이메일을 입력하세요'),
    password: z.string().min(1, '비밀번호를 입력하세요'),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, password } = loginSchema.parse(body);

        const user = await prisma.user.findUnique({
            where: { email },
        });

        // 타이밍 공격 방지: 사용자가 없어도 bcrypt 비교 수행
        if (!user) {
            await bcrypt.compare(password, '$2b$10$placeholder.hash.to.prevent.timing.attack');
            // PII 보호: 실패 이메일을 로그에 남기지 않음
            log.warn('로그인 실패 — 사용자 없음');
            return NextResponse.json({ error: INVALID_CREDENTIALS_MSG }, { status: 401 });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordCorrect) {
            log.warn('로그인 실패 — 비밀번호 불일치', { userId: user.id });
            return NextResponse.json({ error: INVALID_CREDENTIALS_MSG }, { status: 401 });
        }

        // 비밀번호가 맞아도 관리자가 승인하기 전에는 로그인시키지 않는다.
        if (user.status !== 'APPROVED') {
            log.warn('로그인 거부 — 승인 대기 계정', { userId: user.id });
            return NextResponse.json(
                { error: '관리자 승인 대기 중인 계정입니다. 승인 후 로그인할 수 있습니다.' },
                { status: 403 }
            );
        }

        const sessionPayload = { userId: user.id, email: user.email, name: user.name };

        const cookieStore = await cookies();
        cookieStore.set(SESSION_COOKIE_NAME, encodeSessionCookie(sessionPayload), {
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: SESSION_MAX_AGE_SECONDS,
            path: '/',
        });

        log.info('로그인 성공', { userId: user.id });
        return NextResponse.json({
            success: true,
            user: { id: user.id, email: user.email, name: user.name },
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('로그인 중 예상치 못한 오류', error);
        return NextResponse.json({ error: '로그인 중 오류가 발생했습니다.' }, { status: 500 });
    }
}
