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
    accessExpiryFrom, canTransitionRole, parseDirectCreateRole,
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
                // 멘티→매니저, 멘티→멘토, 매니저→멘티, 멘토→멘티, 그리고 관리자로
                // 들어오거나 관리자에서 나가는 모든 방향 등 막히는 경우가 여럿이라
                // 특정 경로 하나를 짚어 안내하면 다른 경우에는 틀린 말이 된다(예:
                // "먼저 멘토로 바꾸세요" 는 멘토 경유도 막힌 지금은 거짓이다).
                // 모든 차단 사례에 그대로 맞는 일반 메시지로 통일한다.
                return NextResponse.json(
                    { error: '허용되지 않는 역할 변경입니다.' },
                    { status: 400 }
                );
            }

            // 관리자는 canTransitionRole 이 같은 역할로의 전환만 허용하므로
            // (관리자는 시딩·DB 직접 수정·ADMIN_EMAILS 로만 임명·해임된다) 이
            // 지점에서 nextRole 이 ADMIN 이면 currentRole 도 이미 ADMIN 이다.
            // "마지막 관리자 강등 금지" 가드와 isAdmin 동기화는 그래서 더 이상
            // 이 액션이 할 일이 아니다 — 관리자 강등 자체가 일어나지 않는다.
            // 권한이 줄어드는 변경은 발급된 세션을 끊어야 즉시 적용된다.
            const losesPower = ROLE_POWER[nextRole] < ROLE_POWER[currentRole];

            const updated = await prisma.user.update({
                where: { id: userId },
                data: {
                    role: nextRole,
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

            // null 은 관리자가 직접 만든 무제한 계정이다(스키마 주석 참고). 실수로
            // 유효기간을 새로 씌우지 않도록 여기서 막는다.
            const current = target.accessExpiresAt;
            if (!current) {
                return NextResponse.json({ error: '이 계정은 이용 기간 제한이 없습니다.' }, { status: 400 });
            }

            // 이미 남은 기간이 더 길면 지금이 아니라 기존 만료일부터 늘린다.
            // 그러지 않으면 "연장"이 오히려 기간을 당겨 버릴 수 있다.
            const base = current > new Date() ? current : new Date();
            const nextExpiry = accessExpiryFrom(base, days);
            // 그래도 원래보다 당겨졌다면 권한이 줄어드는 변경이므로 세션을 끊는다.
            const shortened = nextExpiry < current;

            const updated = await prisma.user.update({
                where: { id: userId },
                data: {
                    accessExpiresAt: nextExpiry,
                    ...(shortened ? { sessionVersion: { increment: 1 } } : {}),
                },
                select: { id: true, email: true, accessExpiresAt: true },
            });

            log.info('접근 기간 연장', { userId, days });
            return NextResponse.json({ success: true, user: updated });
        }

        // 관리자 계정을 승인 취소로 잠그는 실수를 막는다.
        if (action === 'revoke' && target.isAdmin) {
            return NextResponse.json({ error: '관리자 계정은 승인을 취소할 수 없습니다.' }, { status: 400 });
        }

        if (action === 'approve' || action === 'revoke') {
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
        }

        // allowedActions 가 이미 걸러서 실제로는 닿지 않는다. 다만 나중에 action 이
        // 추가되고 분기 처리를 잊으면 조용히 승인 취소로 새는 대신 명시적으로 막는다.
        return NextResponse.json({ error: '처리할 수 없는 action 입니다.' }, { status: 400 });
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
    // 멘티 계정을 만들 때만 의미가 있다. 비워 두면 어느 프로그램에도 속하지
    // 않은 멘티가 되고, 프로젝트 소유자로 지정될 때까지는 그 상태로 남는다.
    programId: z.string().min(1).optional(),
    accessDurationDays: z.number().int().min(1).max(365).optional(),
    profile: z.record(z.unknown()),
});

/** 사람이 옮겨 적을 임시 비밀번호. 헷갈리는 글자를 빼고 14자를 만든다. */
function generateTempPassword(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = randomBytes(12);
    let out = '';
    for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length];
    // lib/password-policy.ts 는 최소 길이만 요구한다(복잡도 규칙 없음). 필수는
    // 아니지만 숫자와 기호를 하나씩 덧붙여 둔다.
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
        const role = parseDirectCreateRole(parsed.data.role);
        if (!role) {
            return NextResponse.json(
                { error: '멘토 또는 멘티 계정만 만들 수 있습니다.' },
                { status: 400 }
            );
        }

        // 멘티만 프로그램에 속한다. 멘토에 programId 를 보내는 것은 클라이언트
        // 실수이므로 조용히 무시하지 않고 막는다.
        if (parsed.data.programId && role !== 'MENTEE') {
            return NextResponse.json({ error: '프로그램은 멘티 계정에만 지정할 수 있습니다.' }, { status: 400 });
        }
        let programId: string | null = null;
        if (parsed.data.programId) {
            const program = await prisma.program.findUnique({
                where: { id: parsed.data.programId },
                select: { id: true },
            });
            if (!program) {
                return NextResponse.json({ error: '프로그램을 찾을 수 없습니다.' }, { status: 404 });
            }
            programId = program.id;
        }

        // 로그인(app/api/auth/login/route.ts)은 입력값을 그대로(대소문자 구분) 조회하므로
        // 여기서 소문자로 바꿔 저장하면 관리자가 알려준 주소 그대로는 로그인할 수 없다.
        // 입력한 그대로 저장하되, 대소문자만 다른 중복 가입은 막는다.
        const email = parsed.data.email.trim();
        const existing = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true },
        });
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
                    programId,
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

        // 메일이 안 가면 임시 비밀번호는 해시로만 남아 관리자도 다시 알아낼 수 없다.
        // 재발송·재설정 엔드포인트가 없으므로 계정을 다시 만들어야 한다고 명확히 알린다.
        const message = emailSent
            ? undefined
            : '계정은 생성되었지만 임시 비밀번호 메일 발송에 실패했습니다. 이 계정을 삭제하고 다시 만들어 주세요.';

        // 평문 비밀번호는 응답에 담지 않는다. 본인 메일로만 간다.
        return NextResponse.json({
            success: true,
            emailSent,
            ...(message ? { message } : {}),
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

        // 멘티는 다르게 다룬다: 소유한 프로젝트가 사라지는 게 아니라 그 프로그램의
        // 매니저에게 넘어간다. 프로그램은 "참여 멘티들의 프로젝트로 구성"되므로,
        // 멘티 계정이 없어졌다고 그 프로젝트까지 함께 없어지면 안 된다. 파괴적인
        // 조작이 아니라서 다른 역할처럼 confirmCascade 를 요구하지 않는다.
        if (parseMemberRole(target.role) === 'MENTEE') {
            const ownedProjects = await prisma.project.findMany({
                where: { ownerId: userId },
                select: { id: true, program: { select: { managerId: true } } },
            });

            await prisma.$transaction([
                ...ownedProjects.map((p) => prisma.project.update({
                    where: { id: p.id },
                    data: { ownerId: p.program.managerId },
                })),
                prisma.user.delete({ where: { id: userId } }),
            ]);

            log.info('멘티 삭제, 소유 프로젝트를 프로그램 매니저에게 이전', {
                userId, transferredProjects: ownedProjects.length,
            });
            return NextResponse.json({ success: true, transferredProjects: ownedProjects.length });
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
