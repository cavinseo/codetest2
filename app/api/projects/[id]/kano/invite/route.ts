import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendSurveyInvitation } from '@/lib/email';
import { generateId } from '@/lib/id';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';

const log = createLogger('api/kano/invite');

// 일괄 초대(lib/kano-invite-template)와 같이 소문자로 맞춰 저장한다. 그러지 않으면 단건
// Foo@x.com 과 일괄 foo@x.com 이 (projectId, email) 유일 제약을 서로 피해 같은 사람에게
// 초대가 두 건 생긴다(감리 B12).
const inviteSchema = z.object({
    email: z.string().trim().email('Valid email is required.').transform((value) => value.toLowerCase()),
});

// POST: Kano 질문지 초대
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const projectId = params.id;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;
    const { userId } = accessResult.user;

    try {
        const body = await readJsonBody(request);
        const { email } = inviteSchema.parse(body);

        // 프로젝트 존재 확인 및 이름 조회(이메일에 사용)
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true },
        });

        if (!project) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        // 동일 프로젝트+이메일에 대한 기존 초대 확인. 이 규칙 전에 대소문자를 살려 저장된
        // 초대도 같은 사람으로 보도록 대소문자 없이 찾는다.
        const existing = await prisma.kanoSurveyInvitation.findFirst({
            where: { projectId, email: { equals: email, mode: 'insensitive' } },
        });

        if (existing) {
            return NextResponse.json(
                {
                    error: '이미 해당 이메일로 질문지 초대가 발송되었습니다.',
                    invitation: existing,
                },
                { status: 400 }
            );
        }

        const token = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const invitation = await prisma.kanoSurveyInvitation.create({
            data: {
                id: generateId('inv'),
                projectId,
                email,
                token,
                invitedBy: userId,
                expiresAt,
            },
        });

        // 질문지 링크 생성
        const surveyLink = new URL(`/survey/${token}`, request.nextUrl.origin).href;

        // 이메일 발송
        const emailSent = await sendSurveyInvitation(email, surveyLink, project.name);

        // 응답자 이메일은 로그에 남기지 않는다(lib/logger.ts 규칙). 무엇이
        // 일어났는지는 invitationId 로 충분히 추적되고, 형제 라우트인
        // kano/invite/bulk 와 invites 도 식별자·건수만 남긴다.
        log.info('Kano 질문지 초대 생성 및 발송 완료', {
            projectId,
            invitationId: invitation.id,
            emailSent
        });

        return NextResponse.json({
            success: true,
            invitation: {
                id: invitation.id,
                email: invitation.email,
                token: invitation.token,
                expiresAt: invitation.expiresAt.toISOString(),
            },
            surveyLink,
            message: emailSent
                ? `${email}에게 질문지 초대 이메일이 발송되었습니다.`
                : `초대가 생성되었습니다. 질문지 링크를 직접 공유하세요.`,
        });
    } catch (error: unknown) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('Kano 초대 오류', error);
        return NextResponse.json(
            { error: 'Kano 질문지 초대 실패' },
            { status: 500 }
        );
    }
}
