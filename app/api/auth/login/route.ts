import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { BCRYPT_ROUNDS, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/constants';
import { encodeSessionCookie } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { LOGIN_RATE_LIMIT, clientIpFrom, consumeRateLimit, resetRateLimit } from '@/lib/rate-limit';
import { isProfileCompleteForRole } from '@/lib/member-profile';
import { parseMemberRole } from '@/lib/member-roles';

const log = createLogger('api/auth/login');

const INVALID_CREDENTIALS_MSG = '이메일 또는 비밀번호가 올바르지 않습니다.';

// 존재하지 않는 계정에도 같은 비용의 bcrypt 비교를 태우기 위한 더미 해시.
// 모듈 로드 시 한 번만 만든다.
const TIMING_SAFE_DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', BCRYPT_ROUNDS);

const loginSchema = z.object({
    email: z.string().email('유효한 이메일을 입력하세요'),
    password: z.string().min(1, '비밀번호를 입력하세요'),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, password } = loginSchema.parse(body);

        // IP 와 이메일을 함께 키로 쓴다. IP 만 쓰면 공유 IP 뒤의 정상 사용자가
        // 말려들고, 이메일만 쓰면 IP 를 바꿔 가며 계정을 돌려 칠 수 있다.
        const rateKey = `login:${clientIpFrom(request.headers)}:${email.toLowerCase()}`;
        const limit = consumeRateLimit(rateKey, LOGIN_RATE_LIMIT);
        if (!limit.allowed) {
            log.warn('로그인 시도 제한 초과');
            return NextResponse.json(
                { error: `로그인 시도가 너무 많습니다. ${limit.retryAfterSeconds}초 후 다시 시도하세요.` },
                { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email },
        });

        // 타이밍 공격 방지: 사용자가 없어도 bcrypt 비교 수행.
        // 예전 상수는 48자라 bcryptjs 가 해시 연산 없이 즉시 false 를 반환했고,
        // 그래서 응답 시간만으로 가입된 이메일을 알아낼 수 있었다. 실제 해시를 쓴다.
        if (!user) {
            await bcrypt.compare(password, TIMING_SAFE_DUMMY_HASH);
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

        // 임시 비밀번호를 받은 회원과 프로필이 미완성인 회원을 로그인 응답에서
        // 바로 가려낸다. 화면은 이 값으로 비밀번호 변경·프로필 작성 화면으로 보낸다.
        // 행 존재 여부가 아니라 현재 역할에 필요한 항목을 다 갖췄는지로 판정한다 —
        // 멘티 -> 멘토 승격은 MemberProfile 을 건드리지 않으므로, 행만 보면
        // expertise 가 빈 멘토도 완료로 잘못 판정된다.
        const profile = await prisma.memberProfile.findUnique({
            where: { userId: user.id },
        });
        const role = parseMemberRole(user.role) ?? 'MENTEE';

        const sessionPayload = { userId: user.id, email: user.email, name: user.name };

        const cookieStore = await cookies();
        // 발급 당시의 sessionVersion 을 서명 안에 넣는다. 이후 비밀번호 변경이나
        // 승인 취소로 값이 올라가면 이 쿠키는 즉시 거부된다.
        const cookieValue = encodeSessionCookie(sessionPayload, {
            sessionVersion: user.sessionVersion,
        });
        cookieStore.set(SESSION_COOKIE_NAME, cookieValue, {
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: SESSION_MAX_AGE_SECONDS,
            path: '/',
        });

        // 정상 로그인이 확인됐으니 이 조합의 실패 카운터는 비운다.
        resetRateLimit(rateKey);

        log.info('로그인 성공', { userId: user.id });
        return NextResponse.json({
            success: true,
            user: { id: user.id, email: user.email, name: user.name },
            mustChangePassword: user.mustChangePassword,
            needsProfile: !isProfileCompleteForRole(role, profile),
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('로그인 중 예상치 못한 오류', error);
        return NextResponse.json({ error: '로그인 중 오류가 발생했습니다.' }, { status: 500 });
    }
}
