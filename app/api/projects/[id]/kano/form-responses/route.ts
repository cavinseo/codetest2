import { NextRequest, NextResponse } from 'next/server';
import { isGoogleConfigured, getGoogleToken } from '@/lib/service-settings';
import { getFormResponses } from '@/lib/google-forms';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { classifyKano } from '@/lib/kano';
import { toErrorResponse } from '@/lib/api-error';
import { GOOGLE_FORMS_DISABLED_MESSAGE, GOOGLE_FORMS_INTEGRATION_ENABLED } from '@/lib/feature-flags';

const log = createLogger('api/kano/form-responses');
const SYSTEM_INVITATION_EMAIL = 'google-forms-system@internal';
const SYSTEM_INVITATION_DURATION_MS = 1000 * 60 * 60 * 24 * 365;

type GoogleFormResponse = Awaited<ReturnType<typeof getFormResponses>>['responses'][number];
type GoogleKanoResponse = {
    respondentEmail: string;
    requirementId: string;
    positiveAnswer: number;
    negativeAnswer: number;
    kanoCategory: string;
    respondedAt: Date;
};

function kanoAnswerScore(answer: string) {
    return answer === 'LIKE' ? 1
        : answer === 'EXPECT' ? 2
            : answer === 'NEUTRAL' ? 3
                : answer === 'TOLERATE' ? 4
                    : 5;
}

function collectLatestGoogleKanoResponses(
    formResponses: GoogleFormResponse[],
    requirements: { id: string }[]
) {
    const responsesByKey = new Map<string, GoogleKanoResponse>();

    for (const formResponse of formResponses) {
        const respondentEmail = formResponse.respondentEmail || 'anonymous@google-forms';
        const respondedAt = new Date(formResponse.submittedAt);

        for (const answer of formResponse.answers) {
            if (!(answer.requirementIndex < requirements.length)) continue;
            const requirement = requirements[answer.requirementIndex];

            const response = {
                requirementId: requirement.id,
                respondentEmail,
                positiveAnswer: kanoAnswerScore(answer.functional),
                negativeAnswer: kanoAnswerScore(answer.dysfunctional),
                kanoCategory: classifyKano(answer.functional, answer.dysfunctional),
                respondedAt,
            };
            const responseKey = `${respondentEmail}\u0000${requirement.id}`;
            const previousResponse = responsesByKey.get(responseKey);
            if (!previousResponse || previousResponse.respondedAt <= respondedAt) {
                responsesByKey.set(responseKey, response);
            }
        }
    }

    return [...responsesByKey.values()];
}

async function saveGoogleKanoResponses(
    projectId: string,
    invitedBy: string,
    responses: GoogleKanoResponse[]
) {
    await prisma.$transaction(async (tx) => {
        // 같은 프로젝트의 동기화는 하나씩 실행한다. 그렇지 않으면 두 요청이
        // 모두 기존 행이 없다고 보고 같은 응답을 함께 저장할 수 있다.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`google-forms-sync:${projectId}`}))::text`;
        const systemInvitation = await tx.kanoSurveyInvitation.upsert({
            where: { projectId_email: { projectId, email: SYSTEM_INVITATION_EMAIL } },
            update: {},
            create: {
                id: generateId('inv'),
                projectId,
                email: SYSTEM_INVITATION_EMAIL,
                token: `system_${generateId('inv')}`,
                invitedBy,
                expiresAt: new Date(Date.now() + SYSTEM_INVITATION_DURATION_MS),
            },
        });

        if (responses.length === 0) return;
        await tx.kanoResponse.deleteMany({
            where: {
                projectId,
                invitationId: systemInvitation.id,
                OR: responses.map(({ respondentEmail, requirementId }) => ({ respondentEmail, requirementId })),
            },
        });
        await tx.kanoResponse.createMany({
            data: responses.map((response) => ({
                id: generateId('response'),
                invitationId: systemInvitation.id,
                projectId,
                ...response,
            })),
        });
    });
}

// POST: Google Forms 응답을 가져와 Kano 데이터로 변환
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const projectId = params.id;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;

    if (!GOOGLE_FORMS_INTEGRATION_ENABLED) {
        return NextResponse.json({ error: GOOGLE_FORMS_DISABLED_MESSAGE }, { status: 503 });
    }

    try {
        if (!(await isGoogleConfigured())) {
            return NextResponse.json(
                { error: 'Google OAuth가 설정되지 않았습니다.' },
                { status: 400 }
            );
        }

        const token = await getGoogleToken();
        if (!token) {
            return NextResponse.json(
                { error: 'Google 인증이 필요합니다.', needsAuth: true },
                { status: 401 }
            );
        }

        const body = await request.json();
        const formId = body.formId;

        if (!formId) {
            return NextResponse.json(
                { error: 'formId가 필요합니다.' },
                { status: 400 }
            );
        }

        const requirements = await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
        });

        if (requirements.length === 0) {
            return NextResponse.json(
                { error: '요구사항이 없습니다.' },
                { status: 400 }
            );
        }

        const { responses } = await getFormResponses(token.accessToken, formId);
        const kanoResponses = collectLatestGoogleKanoResponses(responses, requirements);
        await saveGoogleKanoResponses(projectId, accessResult.user.userId, kanoResponses);
        const importedCount = kanoResponses.length;

        log.info('Kano 응답 가져오기 성공', { projectId, responseCount: responses.length, importedCount });

        return NextResponse.json({
            success: true,
            message: `${responses.length}명의 응답에서 ${importedCount}개 데이터를 가져왔습니다.`,
            responseCount: responses.length,
            importedCount,
        });
    } catch (error: unknown) {
        return toErrorResponse(error, {
            log,
            message: '응답 가져오기에 실패했습니다.',
            context: { projectId },
        });
    }
}
