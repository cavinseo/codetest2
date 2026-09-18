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

        const responsesByKey = new Map<string, {
            respondentEmail: string;
            requirementId: string;
            positiveAnswer: number;
            negativeAnswer: number;
            kanoCategory: string;
            respondedAt: Date;
        }>();

        for (const response of responses) {
            const respondentEmail = response.respondentEmail || 'anonymous@google-forms';

            for (const answer of response.answers) {
                if (answer.requirementIndex < requirements.length) {
                    const req = requirements[answer.requirementIndex];
                    const category = classifyKano(answer.functional, answer.dysfunctional);

                    const respondedAt = new Date(response.submittedAt);
                    const row = {
                        requirementId: req.id,
                        respondentEmail: respondentEmail,
                        positiveAnswer: answer.functional === 'LIKE' ? 1 : answer.functional === 'EXPECT' ? 2 : answer.functional === 'NEUTRAL' ? 3 : answer.functional === 'TOLERATE' ? 4 : 5,
                        negativeAnswer: answer.dysfunctional === 'LIKE' ? 1 : answer.dysfunctional === 'EXPECT' ? 2 : answer.dysfunctional === 'NEUTRAL' ? 3 : answer.dysfunctional === 'TOLERATE' ? 4 : 5,
                        kanoCategory: category,
                        respondedAt,
                    };
                    const key = `${respondentEmail}\u0000${req.id}`;
                    const previous = responsesByKey.get(key);
                    if (!previous || previous.respondedAt <= respondedAt) responsesByKey.set(key, row);
                }
            }
        }

        const newKanoResponses = [...responsesByKey.values()];
        const systemEmail = 'google-forms-system@internal';
        await prisma.$transaction(async (tx) => {
            // 같은 프로젝트의 동기화는 하나씩 실행한다. 그렇지 않으면 두 요청이
            // 모두 기존 행이 없다고 보고 같은 응답을 함께 저장할 수 있다.
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`google-forms-sync:${projectId}`}))::text`;
            const systemInvitation = await tx.kanoSurveyInvitation.upsert({
                where: { projectId_email: { projectId, email: systemEmail } },
                update: {},
                create: {
                    id: generateId('inv'),
                    projectId,
                    email: systemEmail,
                    token: `system_${generateId('inv')}`,
                    invitedBy: accessResult.user.userId,
                    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
                },
            });

            if (newKanoResponses.length === 0) return;
            await tx.kanoResponse.deleteMany({
                where: {
                    projectId,
                    invitationId: systemInvitation.id,
                    OR: newKanoResponses.map(({ respondentEmail, requirementId }) => ({ respondentEmail, requirementId })),
                },
            });
            await tx.kanoResponse.createMany({
                data: newKanoResponses.map((response) => ({
                    id: generateId('response'),
                    invitationId: systemInvitation.id,
                    projectId,
                    ...response,
                })),
            });
        });

        const importedCount = newKanoResponses.length;

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
