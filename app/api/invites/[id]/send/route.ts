// 초대 기록의 등록 이메일에 유효한 기존 멘티 코드를 발송한다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { canIssueInviteCode } from '@/lib/member-roles';
import { canManageThisProgram } from '@/lib/program';
import { inviteAccessExpiresAt } from '@/lib/invite-access';
import { sendMail } from '@/lib/email';
import { escapeHtml } from '@/lib/html-escape';
import { createLogger } from '@/lib/logger';
import { errorCodeOf } from '@/lib/api-error';

const log = createLogger('api/invites/send');

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    if (!canIssueInviteCode(auth.role)) return NextResponse.json({ error: '초대 코드를 발송할 권한이 없습니다.' }, { status: 403 });
    const { id } = await props.params;
    try {
        const invite = await prisma.inviteCode.findUnique({ where: { id }, include: { program: true, usedBy: true } });
        if (!invite) return NextResponse.json({ error: '초대 코드를 찾을 수 없습니다.' }, { status: 404 });
        if (!canManageThisProgram({ role: auth.role, userId: auth.userId }, invite.program)) {
            return NextResponse.json({ error: '이 프로그램의 초대 코드를 발송할 권한이 없습니다.' }, { status: 403 });
        }
        const email = invite.email.trim().toLowerCase();
        const expiresAt = inviteAccessExpiresAt(invite);
        if (invite.role !== 'MENTEE' || !z.string().email().safeParse(email).success || expiresAt.getTime() <= Date.now()) {
            return NextResponse.json({ error: '만료되었거나 사용할 수 없는 멘티 초대 코드입니다.' }, { status: 400 });
        }
        // 발송만으로 가입 상태나 코드의 최초 사용일이 바뀌지 않게 읽기만 한다.
        if (invite.usedAt) {
            const member = invite.usedBy;
            if (!member || member.id !== invite.usedById || member.email.trim().toLowerCase() !== email
                || member.role !== 'MENTEE' || member.isAdmin || member.status !== 'APPROVED' || member.programId !== invite.programId) {
                return NextResponse.json({ error: '초대 코드와 멘티의 등록 정보가 일치하지 않아 발송할 수 없습니다.' }, { status: 409 });
            }
        } else if (invite.usedById || await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } })) {
            return NextResponse.json({ error: '이미 등록된 회원 정보와 연결되지 않은 코드입니다. 초대 정보를 확인하세요.' }, { status: 409 });
        }
        const loginUrl = `${new URL(request.url).origin}/login?mode=invite`;
        const emailSent = await sendMail({
            to: email,
            subject: '[KS-QFD] 멘티 초대 코드 안내',
            html: `<div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; line-height: 1.8; color: #222;">
                <h2>KS-QFD 멘티 초대 코드</h2>
                <p>${escapeHtml(invite.program.name)} 프로그램의 기존 초대 코드를 안내합니다.</p>
                <p>등록된 이메일과 아래 코드로 로그인하세요.</p>
                <p style="font-family: monospace; font-size: 22px; font-weight: bold;">${escapeHtml(invite.code)}</p>
                <p>코드 이용 기한: ${expiresAt.toISOString().slice(0, 10)}까지</p>
                <p>최초 로그인 후 90일과 프로그램 종료일 중 빠른 날까지 이용할 수 있습니다. 메일 재발송으로 기존 이용 기한이 연장되지는 않습니다.</p>
                <p><a href="${escapeHtml(loginUrl)}">초대 코드로 로그인</a></p>
            </div>`,
        });
        log.info('초대 코드 메일 발송', { inviteId: id, emailSent });
        if (!emailSent) return NextResponse.json({ success: false, emailSent: false, error: '메일 발송에 실패했습니다. SMTP 설정을 확인하고 다시 시도하세요.' }, { status: 502 });
        return NextResponse.json({ success: true, emailSent: true });
    } catch (error) {
        log.error('초대 코드 발송 실패', undefined, { code: errorCodeOf(error) ?? undefined });
        return NextResponse.json({ error: '초대 코드 발송에 실패했습니다.' }, { status: 500 });
    }
}
