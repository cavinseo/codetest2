import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendSurveyInvitation } from '@/lib/email';
import { generateId } from '@/lib/id';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import {
    parseInviteEmailText,
    parseKanoInviteWorkbook,
    type ParsedInviteList,
} from '@/lib/kano-invite-template';

const log = createLogger('api/kano/invite/bulk');

// 한 번에 처리할 최대 인원. 메일 발송이 순차 처리라 과도한 요청을 막는다.
const MAX_INVITES_PER_REQUEST = 200;

type InviteStatus = 'invited' | 'skipped' | 'failed';

interface InviteResult {
    email: string;
    status: InviteStatus;
    reason?: string;
    surveyLink?: string;
}

async function readInviteList(request: NextRequest): Promise<ParsedInviteList> {
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!(file instanceof File)) {
            throw new Error('업로드할 명단 파일이 없습니다.');
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        return parseKanoInviteWorkbook(buffer);
    }

    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body.emails)) {
        return parseInviteEmailText(body.emails.join('\n'));
    }
    if (typeof body.text === 'string') {
        return parseInviteEmailText(body.text);
    }

    throw new Error('초대할 이메일 주소가 없습니다.');
}

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;
    const { userId } = accessResult.user;

    try {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true },
        });

        if (!project) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        const parsed = await readInviteList(request);

        if (parsed.rows.length === 0) {
            return NextResponse.json(
                {
                    error: '초대할 수 있는 이메일 주소를 찾지 못했습니다.',
                    skipped: parsed.skipped,
                },
                { status: 400 }
            );
        }

        if (parsed.rows.length > MAX_INVITES_PER_REQUEST) {
            return NextResponse.json(
                { error: `한 번에 최대 ${MAX_INVITES_PER_REQUEST}명까지 초대할 수 있습니다. (요청: ${parsed.rows.length}명)` },
                { status: 400 }
            );
        }

        // 이미 초대한 주소는 다시 만들지 않는다.
        const existing = await prisma.kanoSurveyInvitation.findMany({
            where: { projectId, email: { in: parsed.rows.map((row) => row.email) } },
            select: { email: true },
        });
        const alreadyInvited = new Set(existing.map((row) => row.email));

        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const results: InviteResult[] = parsed.skipped.map((item) => ({
            email: item.value,
            status: 'skipped' as const,
            reason: item.reason,
        }));

        let emailSentCount = 0;

        for (const row of parsed.rows) {
            if (alreadyInvited.has(row.email)) {
                results.push({ email: row.email, status: 'skipped', reason: '이미 초대한 주소입니다.' });
                continue;
            }

            try {
                const token = crypto.randomUUID();
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7);

                await prisma.kanoSurveyInvitation.create({
                    data: {
                        id: generateId('inv'),
                        projectId,
                        email: row.email,
                        token,
                        invitedBy: userId,
                        expiresAt,
                    },
                });

                const surveyLink = `${baseUrl}/survey/${token}`;
                const emailSent = await sendSurveyInvitation(row.email, surveyLink, project.name);
                if (emailSent) emailSentCount++;

                results.push({ email: row.email, status: 'invited', surveyLink });
            } catch (error) {
                log.error('개별 초대 생성 실패', error);
                results.push({ email: row.email, status: 'failed', reason: '초대 생성에 실패했습니다.' });
            }
        }

        const invited = results.filter((result) => result.status === 'invited').length;
        const skipped = results.filter((result) => result.status === 'skipped').length;
        const failed = results.filter((result) => result.status === 'failed').length;

        log.info('Kano 일괄 초대 처리 완료', { projectId, invited, skipped, failed, emailSentCount });

        return NextResponse.json({
            success: true,
            summary: { invited, skipped, failed, emailSent: emailSentCount },
            results,
            message: invited === 0
                ? '새로 초대된 응답자가 없습니다.'
                : emailSentCount === invited
                    ? `${invited}명에게 초대 메일을 발송했습니다.`
                    : `${invited}명을 초대했습니다. 메일 설정이 없어 ${invited - emailSentCount}명은 링크를 직접 공유해야 합니다.`,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '일괄 초대에 실패했습니다.';
        log.error('Kano 일괄 초대 오류', error);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
