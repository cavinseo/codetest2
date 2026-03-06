import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendSurveyInvitation } from '@/lib/email';
import { generateId } from '@/lib/id';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/kano/invite');

const inviteSchema = z.object({
    email: z.string().email('유효한 이메일을 입력하세요'),
});

// POST: Kano 설문 초대
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    try {
        const projectId = params.id;
        const body = await request.json();
        const { email } = inviteSchema.parse(body);

        // 프로젝트 존재 확인 및 이름 조회 (이메일에 사용)
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true },
        });

        if (!project) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        // 동일 프로젝트+이메일에 대해 이미 초대된 정보가 있는지 확인
        const existing = await prisma.kanoSurveyInvitation.findUnique({
            where: {
                projectId_email: { projectId, email },
            },
        });

        if (existing) {
            return NextResponse.json(
                {
                    error: '이 이메일로 이미 설문 초대가 발송되었습니다.',
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

        // 설문 링크 생성
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const surveyLink = `${baseUrl}/survey/${token}`;

        // 이메일 발송
        const emailSent = await sendSurveyInvitation(email, surveyLink, project.name);

        log.info('Kano 설문 초대 생성 및 발송 완료', {
            projectId,
            email,
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
                ? `${email}에게 설문 초대 이메일이 발송되었습니다.`
                : `초대가 생성되었습니다. 설문 링크를 직접 공유하세요.`,
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('Kano 초대 오류', error);
        return NextResponse.json(
            { error: 'Kano 설문 초대 실패' },
            { status: 500 }
        );
    }
}
