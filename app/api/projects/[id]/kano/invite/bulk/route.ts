import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendSurveyInvitation } from '@/lib/email';
import { generateId } from '@/lib/id';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { guardUploadedExcel } from '@/lib/upload-guard';
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

/**
 * 사용자에게 그대로 보여 줄 수 있는 명단 오류. 바깥 catch 는 이 오류의 문구만 응답에 싣는다.
 * 예전에는 모든 Error 의 message 를 400 으로 돌려줘 DB·파서 내부 오류 문구(테이블·제약 이름)가
 * 화면까지 나갔다(2026-11-08 코드 리뷰 6번).
 */
class InviteListError extends Error {
    constructor(message: string, readonly status: 400 | 413 = 400) {
        super(message);
    }
}

async function readInviteList(request: NextRequest): Promise<ParsedInviteList> {
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData().catch(() => {
            throw new InviteListError('업로드한 명단 파일을 읽을 수 없습니다.');
        });
        // 크기·확장자 검사 없이 xlsx 를 동기 파싱하면 큰 파일이나 압축 폭탄 하나로 서버가 멈춘다.
        // 다른 엑셀 업로드 라우트와 같은 검사를 거친다.
        const upload = guardUploadedExcel(formData.get('file'));
        if (!upload.ok) throw new InviteListError(upload.failure.error, upload.failure.status);
        const buffer = Buffer.from(await upload.file.arrayBuffer());
        try {
            return parseKanoInviteWorkbook(buffer);
        } catch {
            throw new InviteListError('명단 파일을 읽을 수 없습니다. 내려받은 양식의 엑셀 파일인지 확인하세요.');
        }
    }

    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body?.emails)) {
        return parseInviteEmailText(body.emails.join('\n'));
    }
    if (typeof body?.text === 'string') {
        return parseInviteEmailText(body.text);
    }

    throw new InviteListError('초대할 이메일 주소가 없습니다.');
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
        if (error instanceof InviteListError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        log.error('Kano 일괄 초대 오류', error);
        return NextResponse.json({ error: '일괄 초대에 실패했습니다. 잠시 후 다시 시도하세요.' }, { status: 500 });
    }
}
