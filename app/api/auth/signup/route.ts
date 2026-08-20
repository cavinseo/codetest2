import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { BCRYPT_ROUNDS } from '@/lib/constants';
import { createLogger } from '@/lib/logger';
import { SIGNUP_RATE_LIMIT, clientIpFrom, consumeRateLimit } from '@/lib/rate-limit';

const log = createLogger('api/auth/signup');

const signupSchema = z.object({
    name: z.string().min(1, '이름을 입력하세요'),
    email: z.string().email('유효한 이메일을 입력하세요'),
    password: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다'),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, email, password } = signupSchema.parse(body);

        // 가입을 무제한 허용하면 승인 대기 큐가 오염되고 DB 행이 소모된다.
        const rateKey = `signup:${clientIpFrom(request.headers)}`;
        const limit = consumeRateLimit(rateKey, SIGNUP_RATE_LIMIT);
        if (!limit.allowed) {
            log.warn('가입 시도 제한 초과');
            return NextResponse.json(
                { error: `가입 시도가 너무 많습니다. ${limit.retryAfterSeconds}초 후 다시 시도하세요.` },
                { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
            );
        }

        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const newUser = await prisma.user.create({
            data: {
                id: generateId('user'),
                name,
                email,
                passwordHash,
            },
        });

        log.info('회원가입 완료 — 승인 대기', { userId: newUser.id });
        return NextResponse.json({
            success: true,
            // 스키마 기본값이 PENDING 이라 이 계정은 관리자 승인 전까지 로그인할 수 없다.
            pendingApproval: true,
            message: '가입이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.',
            user: { id: newUser.id, name: newUser.name, email: newUser.email },
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('회원가입 중 예상치 못한 오류', error);
        return NextResponse.json({ error: '회원가입 중 오류가 발생했습니다.' }, { status: 500 });
    }
}
