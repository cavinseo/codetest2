import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { classifyKanoResponse } from '@/lib/kano-algorithm';
import { KANO_ANSWER_SCORE } from '@/lib/constants';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/survey/submit');

const answerValueSchema = z.enum(['LIKE', 'EXPECT', 'NEUTRAL', 'TOLERATE', 'DISLIKE']);

const submitSchema = z.object({
    answers: z.record(
        z.string(),
        z.object({
            functional: answerValueSchema,
            dysfunctional: answerValueSchema,
        })
    ),
});

// POST: 설문 응답 제출
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ token: string }> }
) {
    const { token } = await props.params;

    try {
        const body = await request.json();
        const { answers } = submitSchema.parse(body);

        // 설문 초대 확인
        const invitation = await prisma.kanoSurveyInvitation.findUnique({
            where: { token },
        });

        if (!invitation) {
            return NextResponse.json({ error: '유효하지 않은 설문 링크입니다.' }, { status: 404 });
        }

        // 만료 검증
        if (invitation.expiresAt < new Date()) {
            return NextResponse.json({ error: '만료된 설문 링크입니다.' }, { status: 410 });
        }

        if (invitation.respondedAt) {
            return NextResponse.json({ error: '이미 응답을 완료하셨습니다.' }, { status: 400 });
        }

        const now = new Date();

        const result = await prisma.$transaction(async (tx: any) => {
            // 1. 응답 데이터 생성
            const newResponses = Object.entries(answers).map(([requirementId, answer]: [string, any]) => {
                const functionalScore = KANO_ANSWER_SCORE[answer.functional as keyof typeof KANO_ANSWER_SCORE];
                const dysfunctionalScore = KANO_ANSWER_SCORE[answer.dysfunctional as keyof typeof KANO_ANSWER_SCORE];

                return {
                    id: generateId('response'),
                    invitationId: invitation.id,
                    projectId: invitation.projectId,
                    requirementId,
                    functionalAnswer: answer.functional,
                    dysfunctionalAnswer: answer.dysfunctional,
                    category: classifyKanoResponse(functionalScore, dysfunctionalScore),
                    respondedAt: now,
                };
            });

            if (newResponses.length > 0) {
                await tx.kanoResponse.createMany({
                    data: newResponses,
                });
            }

            // 2. 초대 상태 업데이트
            await tx.kanoSurveyInvitation.update({
                where: { id: invitation.id },
                data: { respondedAt: now },
            });

            return newResponses.length;
        });

        log.info('설문 응답 제출 성공', { invitationId: invitation.id, responseCount: result });

        return NextResponse.json({ success: true, responseCount: result });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('응답 제출 오류', error);
        return NextResponse.json({ error: '응답 제출 실패' }, { status: 500 });
    }
}
