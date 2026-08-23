import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { BCRYPT_ROUNDS } from '@/lib/constants';
import { createLogger } from '@/lib/logger';
import { SIGNUP_RATE_LIMIT, clientIpFrom, consumeRateLimit } from '@/lib/rate-limit';
import { checkInviteCode, normalizeInviteCode, INVITE_CODE_MESSAGES } from '@/lib/invite-code';
import { accessExpiryFrom, parseInvitableRole, type MemberRole } from '@/lib/member-roles';
import { memberProfileSchemaFor } from '@/lib/member-profile';

const log = createLogger('api/auth/signup');

const signupSchema = z.object({
    name: z.string().min(1, '이름을 입력하세요'),
    email: z.string().email('유효한 이메일을 입력하세요'),
    password: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다'),
    inviteCode: z.string().optional(),
    // 코드가 없을 때 가입자가 스스로 고른 역할. 코드가 있으면 무시되고 코드의
    // 역할이 쓰인다(아래 참고). 관리자·매니저는 가입 화면에서 자처할 수 있는
    // 값이 아니므로 여기서부터 두 값으로 좁혀 막는다.
    role: z.enum(['MENTOR', 'MENTEE'], {
        errorMap: () => ({ message: '역할은 멘토 또는 멘티 중 하나를 선택하세요.' }),
    }).optional(),
    profile: z.record(z.unknown()),
});

/** 코드를 쓰려는 순간 다른 요청이 먼저 써 버린 경우. */
class InviteAlreadyUsedError extends Error {}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, email, password, inviteCode, role: requestedRole, profile } = signupSchema.parse(body);

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

        // 코드가 없으면 가입자가 고른 역할(멘토/멘티)을 쓴다. 이것은 자기 신고일
        // 뿐이고 승인 게이트는 그대로다 — 멘토를 자처해도 계정은 아래에서
        // status: 'PENDING' 으로 남고 관리자가 승인해야 로그인할 수 있으므로
        // 권한 상승 구멍이 아니다. 초대 코드가 있으면 역할이 코드로 정해지고,
        // 그 역할에 맞는 프로필을 받는다(클라이언트가 고른 role 은 무시한다).
        let invite: { id: string; role: MemberRole; accessDurationDays: number } | null = null;
        let role: MemberRole = requestedRole ?? 'MENTEE';

        if (inviteCode) {
            const normalized = normalizeInviteCode(inviteCode);
            const record = await prisma.inviteCode.findUnique({ where: { code: normalized } });
            const rejection = checkInviteCode(record, email);
            if (rejection || !record) {
                return NextResponse.json(
                    { error: INVITE_CODE_MESSAGES[rejection ?? 'NOT_FOUND'] },
                    { status: 400 }
                );
            }
            const inviteRole = parseInvitableRole(record.role);
            if (!inviteRole) {
                return NextResponse.json({ error: INVITE_CODE_MESSAGES.NOT_FOUND }, { status: 400 });
            }
            invite = { id: record.id, role: inviteRole, accessDurationDays: record.accessDurationDays };
            role = inviteRole;
        }

        const profileResult = memberProfileSchemaFor(role).safeParse(profile);
        if (!profileResult.success) {
            return NextResponse.json(
                { error: profileResult.error.errors[0].message },
                { status: 400 }
            );
        }
        const profileData = profileResult.data as Record<string, unknown>;

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // 사용자 생성·프로필 저장·코드 사용 처리를 한 트랜잭션으로 묶는다.
        // 그렇지 않으면 프로필 없는 회원이나, 계정 없이 소진된 코드가 남을 수 있다.
        const now = new Date();
        const newUser = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    id: generateId('user'),
                    name,
                    email,
                    passwordHash,
                    role,
                    // 코드를 발급한 행위 자체가 승인이다. 승인 대기로 두면
                    // 3개월 접근 기간이 대기 중에도 흘러가 버린다.
                    status: invite ? 'APPROVED' : 'PENDING',
                    accessExpiresAt: invite ? accessExpiryFrom(now, invite.accessDurationDays) : null,
                },
            });

            await tx.memberProfile.create({
                data: {
                    userId: user.id,
                    organization: profileData.organization as string,
                    jobTitle: (profileData.jobTitle as string) ?? null,
                    phone: profileData.phone as string,
                    expertise: (profileData.expertise as string) ?? null,
                    careerYears: (profileData.careerYears as number) ?? null,
                    careerSummary: (profileData.careerSummary as string) ?? null,
                    companyName: (profileData.companyName as string) ?? null,
                    industry: (profileData.industry as string) ?? null,
                    foundedYear: (profileData.foundedYear as number) ?? null,
                    privacyConsentAt: now,
                },
            });

            if (invite) {
                // 코드 조회는 트랜잭션 밖에서 했으므로 그 사이에 다른 요청이
                // 먼저 쓸 수 있다. usedAt 이 아직 비어 있을 때만 쓰고, 못 쓰면
                // 이미 누가 쓴 것이라 가입 전체를 되돌린다.
                const marked = await tx.inviteCode.updateMany({
                    where: { id: invite.id, usedAt: null },
                    data: { usedAt: now, usedById: user.id },
                });
                if (marked.count !== 1) {
                    throw new InviteAlreadyUsedError();
                }
            }

            return user;
        });

        log.info('회원가입 완료', { userId: newUser.id, role, viaInvite: Boolean(invite) });
        return NextResponse.json({
            success: true,
            pendingApproval: !invite,
            message: invite
                ? '가입이 완료되었습니다. 바로 로그인할 수 있습니다.'
                : '가입이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.',
            user: { id: newUser.id, name: newUser.name, email: newUser.email },
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        if (error instanceof InviteAlreadyUsedError) {
            return NextResponse.json(
                { error: INVITE_CODE_MESSAGES.ALREADY_USED },
                { status: 409 }
            );
        }
        log.error('회원가입 중 예상치 못한 오류', error);
        return NextResponse.json({ error: '회원가입 중 오류가 발생했습니다.' }, { status: 500 });
    }
}
