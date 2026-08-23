import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { requireAdmin } from '@/lib/authorization';
import { BCRYPT_ROUNDS } from '@/lib/constants';
import { generateId } from '@/lib/id';
import { toErrorResponse } from '@/lib/api-error';
import { sendMail } from '@/lib/email';
import { escapeHtml } from '@/lib/html-escape';
import { buildTempPasswordEmail } from '@/lib/temp-password-email';
import { memberProfileSchemaFor } from '@/lib/member-profile';
import {
    accessExpiryFrom, canTransitionRole, parseInvitableRole,
    parseMemberRole, MEMBER_ROLE_LABELS, type MemberRole,
} from '@/lib/member-roles';

const log = createLogger('api/admin/users');

// ─── GET: 모든 사용자 목록 (passwordHash 제외) ─────────────────────────

export async function GET(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                status: true,
                isAdmin: true,
                role: true,
                accessExpiresAt: true,
                mustChangePassword: true,
                createdAt: true,
                updatedAt: true,
            },
            // 승인 대기가 먼저 보이도록 정렬한다.
            orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
        });

        return NextResponse.json({ users });
    } catch (error: unknown) {
        log.error('사용자 목록 조회 실패', error);
        return NextResponse.json({ error: '사용자 목록 조회 실패' }, { status: 500 });
    }
}

// ─── PATCH: 가입 승인/승인 취소·역할 변경·기간 연장 ─────────────────────

/**
 * 역할의 권한 크기. 값이 줄어드는 변경은 이미 발급된 세션을 끊어야 한다.
 * 멘토와 멘티는 서로 우열이 없어 같은 값을 둔다.
 */
const ROLE_POWER: Record<MemberRole, number> = {
    ADMIN: 3,
    PROGRAM_MANAGER: 2,
    MENTOR: 1,
    MENTEE: 1,
};

export async function PATCH(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const body = await request.json();
        const userId: string | undefined = body?.userId;
        const action: string | undefined = body?.action;

        const allowedActions = ['approve', 'revoke', 'setRole', 'extendAccess'];
        if (!userId || !allowedActions.includes(action ?? '')) {
            return NextResponse.json(
                { error: 'userId 와 action(approve|revoke|setRole|extendAccess)이 필요합니다.' },
                { status: 400 }
            );
        }

        const target = await prisma.user.findUnique({ where: { id: userId } });
        if (!target) {
            return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
        }

        if (action === 'setRole') {
            const nextRole = parseMemberRole(body?.role);
            if (!nextRole) {
                return NextResponse.json({ error: '알 수 없는 역할입니다.' }, { status: 400 });
            }
            const currentRole = parseMemberRole(target.role) ?? 'MENTEE';

            if (!canTransitionRole(currentRole, nextRole)) {
                return NextResponse.json(
                    {
                        error: nextRole === 'PROGRAM_MANAGER'
                            ? '프로그램 매니저는 멘토 중에서만 승격할 수 있습니다. 먼저 멘토로 바꾸세요.'
                            : '허용되지 않는 역할 변경입니다.',
                    },
                    { status: 400 }
                );
            }

            // 마지막 관리자를 강등하면 승인·관리 기능이 영구히 잠긴다.
            // requireAdmin 이 보는 값이 isAdmin 이므로 삭제 가드와 같은 기준으로 센다.
            if (target.isAdmin && nextRole !== 'ADMIN') {
                const adminCount = await prisma.user.count({ where: { isAdmin: true } });
                if (adminCount <= 1) {
                    return NextResponse.json(
                        { error: '마지막 관리자 계정은 강등할 수 없습니다.' },
                        { status: 400 }
                    );
                }
            }

            // role 이 단일 진실이고 isAdmin 은 동기화 대상이다. 둘이 어긋나면
            // requireAdmin 과 프로젝트 접근 판정이 서로 다른 답을 낸다.
            const isAdmin = nextRole === 'ADMIN';
            // 권한이 줄어드는 변경은 발급된 세션을 끊어야 즉시 적용된다.
            const losesPower = ROLE_POWER[nextRole] < ROLE_POWER[currentRole]
                || (target.isAdmin && !isAdmin);

            const updated = await prisma.user.update({
                where: { id: userId },
                data: {
                    role: nextRole,
                    isAdmin,
                    ...(losesPower ? { sessionVersion: { increment: 1 } } : {}),
                },
                select: { id: true, email: true, role: true, isAdmin: true },
            });

            log.info('역할 변경', { userId, role: nextRole });
            return NextResponse.json({ success: true, user: updated });
        }

        if (action === 'extendAccess') {
            const days = typeof body?.days === 'number' ? body.days : null;
            if (!days || days < 1 || days > 365) {
                return NextResponse.json({ error: '연장할 일수(1~365)를 지정하세요.' }, { status: 400 });
            }

            const updated = await prisma.user.update({
                where: { id: userId },
                data: { accessExpiresAt: accessExpiryFrom(new Date(), days) },
                select: { id: true, email: true, accessExpiresAt: true },
            });

            log.info('접근 기간 연장', { userId, days });
            return NextResponse.json({ success: true, user: updated });
        }

        // 관리자 계정을 승인 취소로 잠그는 실수를 막는다.
        if (action === 'revoke' && target.isAdmin) {
            return NextResponse.json({ error: '관리자 계정은 승인을 취소할 수 없습니다.' }, { status: 400 });
        }

        // 승인을 취소할 때는 sessionVersion 을 올려 이미 발급된 세션까지 끊는다.
        // 그러지 않으면 로그인 중인 사용자는 취소 이후에도 계속 쓸 수 있어
        // 승인 게이트가 사후에 아무 소용이 없다.
        const updated = await prisma.user.update({
            where: { id: userId },
            data: action === 'approve'
                ? { status: 'APPROVED' }
                : { status: 'PENDING', sessionVersion: { increment: 1 } },
            select: { id: true, email: true, status: true },
        });

        log.info('사용자 승인 상태 변경', { userId, status: updated.status });
        return NextResponse.json({ success: true, user: updated });
    } catch (error: unknown) {
        log.error('사용자 승인 상태 변경 실패', error);
        return NextResponse.json({ error: '승인 상태 변경에 실패했습니다.' }, { status: 500 });
    }
}

// ─── POST: 멘토·멘티 계정 생성 ────────────────────────────────────────
//
// 관리자가 평문 비밀번호를 다루지 않도록 서버가 임시 비밀번호를 만들어
// 본인에게만 메일로 보낸다. 받은 사람은 첫 로그인 때 반드시 바꾼다.

const createUserSchema = z.object({
    name: z.string().min(1, '이름을 입력하세요.'),
    email: z.string().email('유효한 이메일을 입력하세요.'),
    role: z.string(),
    accessDurationDays: z.number().int().min(1).max(365).optional(),
    profile: z.record(z.unknown()),
});

/** 사람이 옮겨 적을 임시 비밀번호. 헷갈리는 글자를 빼고 12자를 만든다. */
function generateTempPassword(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = randomBytes(12);
    let out = '';
    for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length];
    // 숫자와 기호를 하나씩 섞어 비밀번호 정책을 만족시킨다.
    return `${out}7!`;
}

export async function POST(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const parsed = createUserSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
        }

        // 매니저는 멘토에서 승격으로만 생긴다. 관리자도 여기서 만들지 않는다.
        const role = parseInvitableRole(parsed.data.role);
        if (!role) {
            return NextResponse.json(
                { error: '멘토 또는 멘티 계정만 만들 수 있습니다.' },
                { status: 400 }
            );
        }

        const email = parsed.data.email.trim().toLowerCase();
        const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (existing) {
            return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 });
        }

        const profileResult = memberProfileSchemaFor(role).safeParse(parsed.data.profile);
        if (!profileResult.success) {
            return NextResponse.json({ error: profileResult.error.errors[0].message }, { status: 400 });
        }
        // 스키마는 strict 라 여분의 키는 이미 걸러졌다. privacyConsent 는 컬럼이
        // 아니므로 펼치지 않고 컬럼을 하나씩 적는다.
        const profileData = profileResult.data as Record<string, unknown>;

        const tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
        const now = new Date();

        // 계정과 프로필을 한 트랜잭션으로 묶는다. 그러지 않으면 프로필 없는
        // 회원이 남을 수 있다.
        const created = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    id: generateId('user'),
                    name: parsed.data.name,
                    email,
                    passwordHash,
                    role,
                    // 관리자가 직접 만든 계정이므로 만드는 행위 자체가 승인이다.
                    status: 'APPROVED',
                    mustChangePassword: true,
                    accessExpiresAt: parsed.data.accessDurationDays
                        ? accessExpiryFrom(now, parsed.data.accessDurationDays)
                        : null,
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

            return user;
        });

        const origin = new URL(request.url).origin;
        const mail = buildTempPasswordEmail({
            tempPassword,
            roleLabel: MEMBER_ROLE_LABELS[role],
            loginUrl: `${origin}/login`,
            escapeHtml,
        });
        const emailSent = await sendMail({ to: email, subject: mail.subject, html: mail.html });

        // 평문 비밀번호는 로그에도 남기지 않는다. lib/logger.ts 규칙.
        log.info('계정 생성', { userId: created.id, role, emailSent });

        // 평문 비밀번호는 응답에 담지 않는다. 본인 메일로만 간다.
        return NextResponse.json({
            success: true,
            emailSent,
            user: { id: created.id, name: created.name, email: created.email, role },
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '계정 생성에 실패했습니다.' });
    }
}

// ─── DELETE: 사용자 삭제 ──────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const body = await request.json();
        const userId: string | undefined = body?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'userId가 필요합니다.' }, { status: 400 });
        }

        const target = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!target) {
            return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
        }

        // 자기 자신을 지워 관리 화면에서 스스로 잠기는 사고를 막는다.
        if (userId === adminResult.userId) {
            return NextResponse.json({ error: '본인 계정은 삭제할 수 없습니다.' }, { status: 400 });
        }

        // 마지막 관리자를 지우면 승인·관리 기능이 영구히 잠긴다.
        if (target.isAdmin) {
            const adminCount = await prisma.user.count({ where: { isAdmin: true } });
            if (adminCount <= 1) {
                return NextResponse.json(
                    { error: '마지막 관리자 계정은 삭제할 수 없습니다.' },
                    { status: 400 }
                );
            }
        }

        // User 삭제는 Project.ownerId 의 onDelete: Cascade 를 타고 그 사람이 소유한
        // 프로젝트 전체와 하위 워크시트를 지운다. 그 프로젝트에 참여한 다른 사람의
        // 작업물까지 함께 사라지므로, 건수를 알려주고 확인을 받는다.
        const ownedProjects = await prisma.project.count({ where: { ownerId: userId } });
        if (ownedProjects > 0 && body?.confirmCascade !== true) {
            return NextResponse.json(
                {
                    error: `이 사용자가 소유한 프로젝트 ${ownedProjects}개와 그 안의 모든 워크시트가 함께 삭제됩니다.`
                        + ' 다른 참여자의 작업물도 사라집니다.',
                    needsCascadeConfirm: true,
                    ownedProjects,
                },
                { status: 409 }
            );
        }

        await prisma.user.delete({
            where: { id: userId },
        });

        log.info('사용자 삭제', { userId, ownedProjects });
        return NextResponse.json({ success: true, ownedProjects });
    } catch (error: unknown) {
        // 설문을 발송했거나 엑셀을 import 한 이력이 있으면 FK 제약(Restrict)에 걸린다.
        // 예전에는 이것도 뭉뚱그려 500 이라 원인을 알 수 없었다.
        if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2003') {
            return NextResponse.json(
                { error: '이 사용자는 설문 발송·가져오기 이력이 있어 삭제할 수 없습니다. 승인을 취소해 접근만 막아 주세요.' },
                { status: 409 }
            );
        }
        log.error('사용자 삭제 실패', error);
        return NextResponse.json({ error: '사용자 삭제 실패' }, { status: 500 });
    }
}
