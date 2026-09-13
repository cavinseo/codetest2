import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { classifyKanoResponse } from '@/lib/kano-algorithm';
import { KANO_ANSWER_SCORE } from '@/lib/constants';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';

const log = createLogger('api/survey/submit');

const answerValueSchema = z.enum(['LIKE', 'EXPECT', 'NEUTRAL', 'TOLERATE', 'DISLIKE']);

// 인증 없이 호출되는 엔드포인트라 한 번에 만들 수 있는 행 수에 상한을 둔다.
// 실제 요구사항 수보다 넉넉하되, 단일 요청으로 대량 삽입은 못 하게 한다.
const MAX_ANSWERS_PER_SUBMISSION = 300;

const submitSchema = z.object({
    answers: z.record(
        z.string(),
        z.object({
            functional: answerValueSchema,
            dysfunctional: answerValueSchema,
        })
    ).refine(
        (record) => Object.keys(record).length <= MAX_ANSWERS_PER_SUBMISSION,
        `한 번에 제출할 수 있는 응답은 ${MAX_ANSWERS_PER_SUBMISSION}개까지입니다.`
    ),
});

// POST: 설문 응답 제출
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ token: string }> }
) {
    const { token } = await props.params;
    // catch 블록에서 상관 정보로 쓰기 위해 try 스코프 밖에 둔다. invitation 자체는
    // try 안의 const 라 catch 에서 보이지 않는다.
    let invitationId: string | undefined;

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

        invitationId = invitation.id;

        // 만료 검증
        if (invitation.expiresAt < new Date()) {
            return NextResponse.json({ error: '만료된 설문 링크입니다.' }, { status: 410 });
        }

        if (invitation.respondedAt) {
            return NextResponse.json({ error: '이미 응답을 완료하셨습니다.' }, { status: 400 });
        }

        // answers 의 키는 클라이언트가 정한 문자열이라 그대로 믿으면 안 된다.
        // 검증이 없으면 설문 토큰만 가진 사람이 다른 프로젝트의 requirementId 를 넣어
        // 그 프로젝트의 Kano 분석을 오염시킬 수 있고, FK 위반 여부(200/500)로 특정
        // 요구사항 ID 의 존재를 확인하는 오라클로도 쓸 수 있다.
        const projectRequirements = await prisma.customerRequirement.findMany({
            where: { projectId: invitation.projectId },
            select: { id: true },
        });
        const allowedIds = new Set(projectRequirements.map((row) => row.id));
        const submittedIds = Object.keys(answers);
        const unknownIds = submittedIds.filter((id) => !allowedIds.has(id));

        if (unknownIds.length > 0) {
            log.warn('설문 응답에 이 프로젝트의 것이 아닌 요구사항 ID 가 포함됨', {
                invitationId: invitation.id,
                unknownCount: unknownIds.length,
            });
            return NextResponse.json(
                { error: '설문 문항 정보가 올바르지 않습니다. 화면을 새로고침한 뒤 다시 제출해 주세요.' },
                { status: 400 }
            );
        }

        const now = new Date();

        const result = await prisma.$transaction(async (tx: any) => {
            // 1. 초대를 선점한다. 위 respondedAt 검사는 트랜잭션 밖이라, 제출을
            // 두 번 누르거나 느린 네트워크에서 재시도하면 두 요청이 모두 그 검사를
            // 통과해 응답 세트가 두 벌 저장되고 Kano 분석의 응답 수·비율이 그대로
            // 두 배가 된다. (invitationId, requirementId) 유니크 제약이 없어 DB 도
            // 막아 주지 않으므로, respondedAt 이 아직 비어 있을 때만 찍는
            // updateMany 의 count 로 승자를 가린다. 진 쪽은 아무것도 쓰지 않는다.
            const claimed = await tx.kanoSurveyInvitation.updateMany({
                where: { id: invitation.id, respondedAt: null },
                data: { respondedAt: now },
            });

            if (claimed.count === 0) return null;

            // 2. 응답 데이터 생성
            const newResponses = Object.entries(answers).map(([requirementId, answer]: [string, any]) => {
                const functionalScore = KANO_ANSWER_SCORE[answer.functional as keyof typeof KANO_ANSWER_SCORE];
                const dysfunctionalScore = KANO_ANSWER_SCORE[answer.dysfunctional as keyof typeof KANO_ANSWER_SCORE];

                return {
                    id: generateId('response'),
                    invitationId: invitation.id,
                    projectId: invitation.projectId,
                    requirementId,
                    respondentEmail: invitation.email,
                    positiveAnswer: functionalScore,
                    negativeAnswer: dysfunctionalScore,
                    kanoCategory: classifyKanoResponse(functionalScore as any, dysfunctionalScore as any),
                    respondedAt: now,
                };
            });

            if (newResponses.length > 0) {
                await tx.kanoResponse.createMany({
                    data: newResponses,
                });
            }

            return newResponses.length;
        });

        // 선점에 진 요청이다. 먼저 도착한 제출이 이미 저장됐으므로 응답자에게는
        // 트랜잭션 밖 검사와 같은 안내를 준다.
        if (result === null) {
            return NextResponse.json({ error: '이미 응답을 완료하셨습니다.' }, { status: 400 });
        }

        log.info('설문 응답 제출 성공', { invitationId: invitation.id, responseCount: result });

        return NextResponse.json({ success: true, responseCount: result });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            log.warn('응답 검증 오류 (Zod)', { firstIssue: error.errors[0]?.message });
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }

        // 인증 없이 호출 가능한 공개 엔드포인트다. Prisma 메시지에는 테이블·제약조건
        // 이름이 들어가므로 절대 내보내지 않는다.
        return toErrorResponse(error, {
            log,
            message: '응답 제출에 실패했습니다.',
            // 토큰은 이 설문의 비밀 자격증명이라 기록하지 않는다.
            context: { invitationId },
        });
    }
}
