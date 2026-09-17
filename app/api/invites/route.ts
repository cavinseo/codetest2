// 멘티 초대 코드의 발행·목록·회수 API.
//
// 멘토는 정식 등록(자기 신고 + 관리자 승인)으로만 들어오므로 이 코드는
// 멘티 전용이다. 코드는 프로그램에 묶인다 — 그 코드로 가입한 멘티는 그
// 프로그램에만 속하게 된다(User.programId).
//
// 매니저도 쓰므로 requireAdmin 이 아니라 시스템 역할 게이트를 쓴다.
// 그래서 경로도 /api/admin/ 아래에 두지 않는다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { errorCodeOf, toErrorResponse } from '@/lib/api-error';
import { sendMail } from '@/lib/email';
import { escapeHtml } from '@/lib/html-escape';
import {
    canIssueInviteCode,
    parseInvitableRole,
    MEMBER_ROLE_LABELS,
    DEFAULT_ACCESS_DURATION_DAYS,
} from '@/lib/member-roles';
import { canManageThisProgram } from '@/lib/program';
import { buildInviteEmail, generateInviteCode } from '@/lib/invite-code';
import { inviteAccessExpiresAt } from '@/lib/invite-access';
import { formatInviteExpiryDate, inviteExpirySchema } from '@/lib/invite-expiry';

const log = createLogger('api/invites');

const issueSchema = z.object({
    email: z.string().email('유효한 이메일을 입력하세요.'),
    role: z.string(),
    programId: z.string().min(1, '프로그램을 선택하세요.'),
    expiresAt: inviteExpirySchema,
    accessDurationDays: z.number().int().min(1).max(365).optional(),
});

const revokeSchema = z.object({ id: z.string().min(1) });
const extendSchema = z.object({ id: z.string().min(1), expiresAt: inviteExpirySchema });

function expiryError(expiresAt: Date, programEndsAt: Date, now: Date): string | null {
    if (programEndsAt <= now) return '종료된 프로그램의 초대 기한은 지정할 수 없습니다.';
    if (expiresAt <= now) return '이용 기한은 오늘 이후 날짜로 입력하세요.';
    if (formatInviteExpiryDate(expiresAt) > formatInviteExpiryDate(programEndsAt)) {
        return '이용 기한은 프로그램 종료일을 넘길 수 없습니다.';
    }
    return null;
}

export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canIssueInviteCode(authResult.role)) {
        return NextResponse.json({ error: '초대 코드를 볼 권한이 없습니다.' }, { status: 403 });
    }

    try {
        // 매니저는 자신이 개설한 프로그램의 코드만 본다. 다른 매니저가 누구를
        // 초대했는지까지 보일 이유가 없다. 관리자는 전체를 본다.
        const scope = authResult.role === 'ADMIN' ? {} : { program: { managerId: authResult.userId } };

        const invites = await prisma.inviteCode.findMany({
            where: scope,
            select: {
                id: true, code: authResult.role === 'ADMIN', email: true, role: true, expiresAt: true,
                accessDurationDays: true, accessExpiresAt: true, usedAt: true, createdAt: true,
                programId: true, program: { select: { name: true, endsAt: true } },
                usedBy: { select: { accessExpiresAt: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({
            invites: invites.map(({ program, usedBy, code, ...rest }) => ({
                ...rest, ...(authResult.role === 'ADMIN' ? { code } : {}), programName: program.name,
                programEndsAt: program.endsAt,
                expiresAt: inviteAccessExpiresAt({ ...rest, program, usedBy }),
            })),
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '초대 코드 목록을 불러오지 못했습니다.' });
    }
}

export async function POST(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canIssueInviteCode(authResult.role)) {
        return NextResponse.json({ error: '초대 코드를 발행할 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const parsed = issueSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
        }

        // 멘토는 코드로 만들지 않는다. 정식 등록(자기 신고 + 관리자 승인)으로만 생긴다.
        const role = parseInvitableRole(parsed.data.role);
        if (!role) {
            return NextResponse.json(
                { error: '초대 코드는 멘티로만 발행할 수 있습니다.' },
                { status: 400 }
            );
        }

        const email = parsed.data.email.trim().toLowerCase();
        const code = generateInviteCode();
        const accessDurationDays = parsed.data.accessDurationDays ?? DEFAULT_ACCESS_DURATION_DAYS;
        const issued = await prisma.$transaction(async (tx) => {
            // 프로그램이 달라도 같은 이메일에 유효 코드가 둘 발급되지 않도록 직렬화한다.
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-email:${email}`}))::text`;
            const program = await tx.program.findUnique({
                where: { id: parsed.data.programId }, select: { id: true, managerId: true, endsAt: true },
            });
            if (!program) return { error: '프로그램을 찾을 수 없습니다.', status: 404 };
            if (!canManageThisProgram({ role: authResult.role, userId: authResult.userId }, program)) {
                return { error: '이 프로그램에 초대 코드를 발행할 권한이 없습니다.', status: 403 };
            }
            const now = new Date();
            const error = expiryError(parsed.data.expiresAt, program.endsAt, now);
            if (error) return { error, status: 400 };
            const expiresAt = new Date(Math.min(parsed.data.expiresAt.getTime(), program.endsAt.getTime()));
            const existing = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
            if (existing) return { error: '이미 가입된 이메일입니다.', status: 409 };
            const previous = await tx.inviteCode.findMany({
                where: { email: { equals: email, mode: 'insensitive' } },
                include: { program: { select: { endsAt: true } }, usedBy: { select: { accessExpiresAt: true } } },
            });
            if (previous.some((record) => inviteAccessExpiresAt(record).getTime() > now.getTime())) {
                return { error: '이미 발행된 유효한 초대 코드가 있습니다.', status: 409 };
            }
            const invite = await tx.inviteCode.create({ data: {
                id: generateId('invite'),
                code,
                email,
                role,
                programId: program.id,
                expiresAt,
                accessExpiresAt: expiresAt,
                accessDurationDays,
                issuedById: authResult.userId,
            } });
            return { invite };
        });
        if ('error' in issued) return NextResponse.json({ error: issued.error }, { status: issued.status });
        const { invite } = issued;

        const origin = new URL(request.url).origin;
        const mail = buildInviteEmail({
            code,
            roleLabel: MEMBER_ROLE_LABELS[role],
            expiresAt: invite.expiresAt,
            accessExpiresAt: invite.accessExpiresAt,
            accessDurationDays,
            signupUrl: `${origin}/login?mode=invite`,
            escapeHtml,
        });
        const emailSent = await sendMail({ to: email, subject: mail.subject, html: mail.html });

        log.info('초대 코드 발행', { inviteId: invite.id, role, emailSent });

        // 발송이 실패해도 코드는 이미 만들어졌다. 관리자가 직접 전달할 수 있도록
        // 코드와 실패 사실을 함께 돌려준다. 조용히 성공으로 처리하지 않는다.
        return NextResponse.json({
            success: true,
            emailSent,
            ...(authResult.role === 'ADMIN' ? { code } : {}),
            invite: {
                id: invite.id, email: invite.email, role: invite.role,
                programId: invite.programId, expiresAt: invite.expiresAt, accessDurationDays,
            },
        });
    } catch (error: unknown) {
        log.error('초대 코드 발행 실패', undefined, { code: errorCodeOf(error) ?? undefined });
        return NextResponse.json({ error: '초대 코드 발행에 실패했습니다.' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canIssueInviteCode(authResult.role)) {
        return NextResponse.json({ error: '초대 기한을 변경할 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const parsed = extendSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
        const target = await prisma.inviteCode.findUnique({ where: { id: parsed.data.id }, select: { email: true } });
        if (!target) return NextResponse.json({ error: '초대 코드를 찾을 수 없습니다.' }, { status: 404 });
        const email = target.email.trim().toLowerCase();

        const result = await prisma.$transaction(async (tx) => {
            // 재발급과 연장이 같은 이메일에 유효 코드를 둘 만들지 못하게 한다.
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-email:${email}`}))::text`;
            // 첫 로그인과 경합해도 연결된 계정의 기한까지 한 번에 연장한다.
            await tx.$queryRaw`SELECT id FROM invite_codes WHERE id = ${parsed.data.id} FOR UPDATE`;
            const invite = await tx.inviteCode.findUnique({
                where: { id: parsed.data.id }, include: { program: true, usedBy: true },
            });
            if (!invite) return { error: '초대 코드를 찾을 수 없습니다.', status: 404 };
            if (!canManageThisProgram({ role: authResult.role, userId: authResult.userId }, invite.program)) {
                return { error: '이 초대 기한을 변경할 권한이 없습니다.', status: 403 };
            }
            if (invite.role !== 'MENTEE') return { error: '멘티 초대 코드만 연장할 수 있습니다.', status: 400 };
            const now = new Date();
            const error = expiryError(parsed.data.expiresAt, invite.program.endsAt, now);
            if (error) return { error, status: 400 };
            const expiresAt = new Date(Math.min(parsed.data.expiresAt.getTime(), invite.program.endsAt.getTime()));
            if (expiresAt <= inviteAccessExpiresAt(invite)) {
                return { error: '현재 기한보다 늦은 날짜를 선택하세요.', status: 400 };
            }

            if (invite.usedAt) {
                const user = invite.usedBy;
                if (!user || user.id !== invite.usedById || user.role !== 'MENTEE' || user.isAdmin || user.status !== 'APPROVED'
                    || user.programId !== invite.programId || user.email.trim().toLowerCase() !== email) {
                    return { error: '초대 코드에 연결된 멘티 정보를 확인하세요.', status: 400 };
                }
                const updated = await tx.user.updateMany({
                    where: { id: user.id, role: 'MENTEE', isAdmin: false, status: 'APPROVED', programId: invite.programId,
                        email: { equals: email, mode: 'insensitive' }, accessExpiresAt: user.accessExpiresAt },
                    data: { accessExpiresAt: expiresAt },
                });
                if (updated.count !== 1) return { error: '멘티 정보가 변경되었습니다. 목록을 새로고침하세요.', status: 409 };
            } else {
                if (invite.usedById) return { error: '초대 코드에 연결된 멘티 정보를 확인하세요.', status: 400 };
                const existing = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
                if (existing) return { error: '이미 가입된 이메일입니다.', status: 409 };
                const others = await tx.inviteCode.findMany({
                    where: { id: { not: invite.id }, email: { equals: email, mode: 'insensitive' } },
                    include: { program: { select: { endsAt: true } }, usedBy: { select: { accessExpiresAt: true } } },
                });
                if (others.some((record) => inviteAccessExpiresAt(record) > now)) {
                    return { error: '이미 발행된 다른 유효한 초대 코드가 있습니다.', status: 409 };
                }
            }

            await tx.inviteCode.update({ where: { id: invite.id }, data: { expiresAt, accessExpiresAt: expiresAt } });
            return { invite: { id: invite.id, expiresAt } };
        });
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
        log.info('초대 기한 연장', { inviteId: result.invite.id });
        return NextResponse.json({ success: true, invite: result.invite });
    } catch (error: unknown) {
        log.error('초대 기한 연장 실패', undefined, { code: errorCodeOf(error) ?? undefined });
        return NextResponse.json({ error: '초대 기한 변경에 실패했습니다.' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canIssueInviteCode(authResult.role)) {
        return NextResponse.json({ error: '초대 코드를 회수할 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const parsed = revokeSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });
        }

        const invite = await prisma.inviteCode.findUnique({
            where: { id: parsed.data.id },
            select: { id: true, usedAt: true, program: { select: { managerId: true } } },
        });
        if (!invite) {
            return NextResponse.json({ error: '초대 코드를 찾을 수 없습니다.' }, { status: 404 });
        }
        // 다른 매니저가 개설한 프로그램의 코드는 회수할 수 없다. GET 의 조회
        // 범위와 같은 경계다.
        if (!canManageThisProgram({ role: authResult.role, userId: authResult.userId }, invite.program)) {
            return NextResponse.json({ error: '이 초대 코드를 회수할 권한이 없습니다.' }, { status: 403 });
        }
        if (invite.usedAt) {
            return NextResponse.json({ error: '이미 사용된 코드는 회수할 수 없습니다.' }, { status: 400 });
        }

        // 삭제가 아니라 만료 처리다. 누가 누구에게 발급했는지가 이력으로 남아야 한다.
        const revoked = await prisma.inviteCode.updateMany({
            where: { id: invite.id, usedAt: null, usedById: null },
            data: { expiresAt: new Date() },
        });
        if (revoked.count !== 1) {
            return NextResponse.json({ error: '이미 사용된 코드는 회수할 수 없습니다.' }, { status: 400 });
        }

        log.info('초대 코드 회수', { inviteId: invite.id });
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '초대 코드 회수에 실패했습니다.' });
    }
}
