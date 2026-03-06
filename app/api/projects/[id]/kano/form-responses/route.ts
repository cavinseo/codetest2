import { NextRequest, NextResponse } from 'next/server';
import { isGoogleConfigured, getGoogleToken } from '@/lib/service-settings';
import { getFormResponses } from '@/lib/google-forms';
import { prisma } from '@/lib/prisma';
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

    try {
        if (!isGoogleConfigured()) {
            return NextResponse.json(
                { error: 'Google OAuth가 설정되지 않았습니다.' },
                { status: 400 }
            );
        }

        const token = getGoogleToken('default');
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

        for (const response of responses) {
            // Google Form 응답자용 가상 초대 ID 생성
            const invitationId = `gform_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

            for (const answer of response.answers) {
                if (answer.requirementIndex < requirements.length) {
                    const req = requirements[answer.requirementIndex];
                    const category = classifyKano(answer.functional, answer.dysfunctional);

                    newKanoResponses.push({
                        id: generateId('response'),
                        invitationId,
                        projectId,
                        requirementId: req.id,
                        functionalAnswer: answer.functional,
                        dysfunctionalAnswer: answer.dysfunctional,
                        category,
                        respondedAt: new Date(response.submittedAt),
                    });

                    importedCount++;
                }
            }
        }

        if (newKanoResponses.length > 0) {
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
