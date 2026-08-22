// 멘토·멘티 초대 코드의 발행·목록·회수 API.
//
// 매니저도 쓰므로 requireAdmin 이 아니라 시스템 역할 게이트를 쓴다.
// 그래서 경로도 /api/admin/ 아래에 두지 않는다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { sendMail } from '@/lib/email';
import { escapeHtml } from '@/lib/html-escape';
import {
    canIssueInviteCode,
    parseInvitableRole,
    MEMBER_ROLE_LABELS,
    DEFAULT_ACCESS_DURATION_DAYS,
} from '@/lib/member-roles';
import { buildInviteEmail, generateInviteCode, inviteCodeExpiryFrom } from '@/lib/invite-code';

const log = createLogger('api/invites');

const issueSchema = z.object({
    email: z.string().email('유효한 이메일을 입력하세요.'),
    role: z.string(),
    accessDurationDays: z.number().int().min(1).max(365).optional(),
});

const revokeSchema = z.object({ id: z.string().min(1) });

export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canIssueInviteCode(authResult.role)) {
        return NextResponse.json({ error: '초대 코드를 볼 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const invites = await prisma.inviteCode.findMany({
            select: {
                id: true, code: true, email: true, role: true, expiresAt: true,
                accessDurationDays: true, usedAt: true, createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ invites });
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
        const parsed = issueSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
        }

        // 매니저와 관리자는 코드로 만들지 않는다. 매니저는 멘토에서 승격으로만 생긴다.
        const role = parseInvitableRole(parsed.data.role);
        if (!role) {
            return NextResponse.json(
                { error: '초대 코드는 멘토 또는 멘티로만 발행할 수 있습니다.' },
                { status: 400 }
            );
        }

        const email = parsed.data.email.trim().toLowerCase();
        const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (existing) {
            return NextResponse.json({ error: '이미 가입된 이메일입니다.' }, { status: 409 });
        }

        const now = new Date();
        const code = generateInviteCode();
        const accessDurationDays = parsed.data.accessDurationDays ?? DEFAULT_ACCESS_DURATION_DAYS;

        const invite = await prisma.inviteCode.create({
            data: {
                id: generateId('invite'),
                code,
                email,
                role,
                expiresAt: inviteCodeExpiryFrom(now),
                accessDurationDays,
                issuedById: authResult.userId,
            },
        });

        const origin = new URL(request.url).origin;
        const mail = buildInviteEmail({
            code,
            roleLabel: MEMBER_ROLE_LABELS[role],
            expiresAt: invite.expiresAt,
            accessDurationDays,
            signupUrl: `${origin}/signup`,
            escapeHtml,
        });
        const emailSent = await sendMail({ to: email, subject: mail.subject, html: mail.html });

        log.info('초대 코드 발행', { inviteId: invite.id, role, emailSent });

        // 발송이 실패해도 코드는 이미 만들어졌다. 관리자가 직접 전달할 수 있도록
        // 코드와 실패 사실을 함께 돌려준다. 조용히 성공으로 처리하지 않는다.
        return NextResponse.json({
            success: true,
            emailSent,
            code,
            invite: {
                id: invite.id, email: invite.email, role: invite.role,
                expiresAt: invite.expiresAt, accessDurationDays,
            },
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '초대 코드 발행에 실패했습니다.' });
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
            select: { id: true, usedAt: true },
        });
        if (!invite) {
            return NextResponse.json({ error: '초대 코드를 찾을 수 없습니다.' }, { status: 404 });
        }
        if (invite.usedAt) {
            return NextResponse.json({ error: '이미 사용된 코드는 회수할 수 없습니다.' }, { status: 400 });
        }

        // 삭제가 아니라 만료 처리다. 누가 누구에게 발급했는지가 이력으로 남아야 한다.
        await prisma.inviteCode.update({
            where: { id: invite.id },
            data: { expiresAt: new Date() },
        });

        log.info('초대 코드 회수', { inviteId: invite.id });
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '초대 코드 회수에 실패했습니다.' });
    }
}
