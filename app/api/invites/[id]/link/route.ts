// 관리자가 기존 회원 연결 영향을 확인하고 명시적으로 승인하는 API.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/authorization';
import { getInviteMemberLinkPreview, InviteMemberLinkError, linkInviteMember } from '@/lib/invite-member-link';
import { createLogger } from '@/lib/logger';
import { errorCodeOf } from '@/lib/api-error';

const log = createLogger('api/invites/link');
const schema = z.object({ memberId: z.string().min(1), previewToken: z.string().regex(/^[a-f0-9]{64}$/), confirmIdentity: z.literal(true) });
type RouteProps = { params: Promise<{ id: string }> };

function failure(error: unknown) {
    if (error instanceof InviteMemberLinkError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: '회원 본인 여부와 연결 내용을 확인하세요.' }, { status: 400 });
    const postgresCode = (error as { meta?: { code?: string } } | null)?.meta?.code;
    if (['P2002', 'P2025', 'P2034'].includes(errorCodeOf(error) ?? '')
        || (errorCodeOf(error) === 'P2010' && ['40P01', '40001'].includes(postgresCode ?? ''))) {
        return NextResponse.json({ error: '회원 또는 초대 정보가 변경되었습니다. 연결 내용을 다시 확인하세요.' }, { status: 409 });
    }
    log.error('기존 회원 연결 실패', undefined, { code: errorCodeOf(error) ?? undefined });
    return NextResponse.json({ error: '기존 회원 연결 중 오류가 발생했습니다.' }, { status: 500 });
}

export async function GET(request: NextRequest, props: RouteProps) {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;
    try {
        const { id } = await props.params;
        return NextResponse.json({ preview: await getInviteMemberLinkPreview(id) });
    } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest, props: RouteProps) {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;
    try {
        const { memberId, previewToken } = schema.parse(await request.json().catch(() => null));
        const { id } = await props.params;
        const result = await linkInviteMember(id, memberId, previewToken);
        log.warn('관리자가 기존 멘티를 초대에 연결함', {
            actorId: admin.userId, inviteId: id, memberId, previousStatus: result.member.status,
            programId: result.program.id, resetPassword: result.resetPassword,
            previousAccessExpiresAt: result.member.accessExpiresAt ?? undefined, accessExpiresAt: result.accessExpiresAt,
        });
        return NextResponse.json({ success: true });
    } catch (error) { return failure(error); }
}
