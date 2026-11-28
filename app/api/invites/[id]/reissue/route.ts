// 유출된 멘티 초대 코드를 새 코드로 바꾸고 등록 이메일로 발송한다.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { canIssueInviteCode } from '@/lib/member-roles';
import { reissueMenteeInvite } from '@/lib/invite-reissue';
import { formatInviteExpiryDate } from '@/lib/invite-expiry';
import { sendMail } from '@/lib/email';
import { escapeHtml } from '@/lib/html-escape';
import { createLogger } from '@/lib/logger';
import { errorCodeOf } from '@/lib/api-error';

const log = createLogger('api/invites/reissue');

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    if (!canIssueInviteCode(auth.role)) {
        return NextResponse.json({ error: '초대 코드를 재발급할 권한이 없습니다.' }, { status: 403 });
    }
    const { id } = await props.params;

    try {
        const result = await reissueMenteeInvite(id, { role: auth.role, userId: auth.userId });
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
        const { invite } = result;

        const loginUrl = `${new URL(request.url).origin}/login?mode=invite`;
        const emailSent = await sendMail({
            to: invite.email,
            subject: '[KS-QFD] 멘티 초대 코드 재발급 안내',
            html: `<div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; line-height: 1.8; color: #222;">
                <h2>KS-QFD 멘티 초대 코드 재발급</h2>
                <p>${escapeHtml(invite.programName)} 프로그램의 초대 코드가 새로 발급되었습니다. <strong>이전 코드는 더 이상 사용할 수 없습니다.</strong></p>
                <p>등록된 이메일과 아래 새 코드로 로그인하세요.</p>
                <p style="font-family: monospace; font-size: 22px; font-weight: bold;">${escapeHtml(invite.code)}</p>
                <p>${invite.usedAt
                    ? `회원 이용만료일: ${formatInviteExpiryDate(invite.loginExpiresAt)}까지 (한국 시간)`
                    : `첫 로그인 기한: ${formatInviteExpiryDate(invite.expiresAt)}까지 (한국 시간)`}. 재발급으로 기존 이용 기한이 연장되지는 않습니다.</p>
                ${invite.memberCredentialsRotated
                    ? '<p>보안을 위해 기존 로그인 상태와 비밀번호를 모두 초기화했습니다. 비밀번호를 쓰던 경우 새 코드로 로그인한 뒤 다시 설정하세요.</p>'
                    : ''}
                <p>이 메일을 다른 사람에게 전달하지 마세요.</p>
                <p><a href="${escapeHtml(loginUrl)}">초대 코드로 로그인</a></p>
            </div>`,
        });
        // 코드와 이메일은 로그인 자격이라 기록하지 않는다.
        log.info('초대 코드 재발급', { inviteId: invite.id, emailSent, memberCredentialsRotated: invite.memberCredentialsRotated });

        return NextResponse.json({
            success: true,
            emailSent,
            memberCredentialsRotated: invite.memberCredentialsRotated,
            // 목록 API 와 같은 기준으로 관리자에게만 코드를 준다. 매니저는 메일이
            // 실패하면 "메일 재발송"으로 다시 보낸다.
            ...(auth.role === 'ADMIN' ? { code: invite.code } : {}),
            ...(emailSent ? {} : { warning: '코드는 재발급됐지만 메일 발송에 실패했습니다. SMTP 설정을 확인한 뒤 메일 재발송을 눌러 주세요.' }),
        });
    } catch (error) {
        log.error('초대 코드 재발급 실패', undefined, { code: errorCodeOf(error) ?? undefined });
        return NextResponse.json({ error: '초대 코드 재발급에 실패했습니다.' }, { status: 500 });
    }
}
