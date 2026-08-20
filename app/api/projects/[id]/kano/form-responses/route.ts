import { NextRequest, NextResponse } from 'next/server';
import { isGoogleConfigured, getGoogleToken } from '@/lib/service-settings';
import { getFormResponses } from '@/lib/google-forms';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { classifyKano } from '@/lib/kano';

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

        const newKanoResponses: any[] = [];
        let importedCount = 0;

        // Google Form 응답 저장용 시스템 공통 초대(Invitation) 확인 또는 생성
        // Google Forms 응답은 개별 토큰이 없으므로 시스템용 공통 초대를 하나 만듭니다.
        const systemEmail = 'google-forms-system@internal';
        let systemInvitation = await prisma.kanoSurveyInvitation.findUnique({
            where: {
                projectId_email: { projectId, email: systemEmail }
            }
        });

        if (!systemInvitation) {
            systemInvitation = await prisma.kanoSurveyInvitation.create({
                data: {
                    id: generateId('inv'),
                    projectId,
                    email: systemEmail,
                    token: `system_${generateId('inv')}`,
                    invitedBy: 'system', // 시스템 응답은 현재 사용자 ID가 필요하지 않음
                    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), // 1년
                }
            });
        }

        for (const response of responses) {
            const respondentEmail = response.respondentEmail || 'anonymous@google-forms';

            for (const answer of response.answers) {
                if (answer.requirementIndex < requirements.length) {
                    const req = requirements[answer.requirementIndex];
                    const category = classifyKano(answer.functional, answer.dysfunctional);

                    newKanoResponses.push({
                        id: generateId('response'),
                        invitationId: systemInvitation.id,
                        projectId,
                        requirementId: req.id,
                        respondentEmail: respondentEmail,
                        positiveAnswer: answer.functional === 'LIKE' ? 1 : answer.functional === 'EXPECT' ? 2 : answer.functional === 'NEUTRAL' ? 3 : answer.functional === 'TOLERATE' ? 4 : 5,
                        negativeAnswer: answer.dysfunctional === 'LIKE' ? 1 : answer.dysfunctional === 'EXPECT' ? 2 : answer.dysfunctional === 'NEUTRAL' ? 3 : answer.dysfunctional === 'TOLERATE' ? 4 : 5,
                        kanoCategory: category,
                        respondedAt: new Date(response.submittedAt),
                    });

                    importedCount++;
                }
            }
        }

        if (newKanoResponses.length > 0) {
            // 기존 중복 데이터 방지 로직이 필요할 수 있으나 우선 createMany로 처리
            await prisma.kanoResponse.createMany({
                data: newKanoResponses,
            });
        }

        log.info('Kano 응답 가져오기 성공', { projectId, responseCount: responses.length, importedCount });

        return NextResponse.json({
            success: true,
            message: `${responses.length}명의 응답에서 ${importedCount}개 데이터를 가져왔습니다.`,
            responseCount: responses.length,
            importedCount,
        });
    } catch (error: any) {
        log.error('Form responses import error:', error);
        return NextResponse.json(
            { error: `응답 가져오기 실패: ${error.message}` },
            { status: 500 }
        );
    }
}
