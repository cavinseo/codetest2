import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/kano/responses');

// GET: Kano 전체 개별 응답자별 결과 목록 조회
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;

        // DB에서 해당 프로젝트의 전체 개별 응답 데이터를 가져오기(시간순 정렬)
        const allResponses = await prisma.kanoResponse.findMany({
            where: { projectId },
            orderBy: { respondedAt: 'desc' },
        });

        // ?ъ슜???대찓?? 蹂꾨줈 ?묐떟 蹂묓빀
        const respondentMap = new Map<string, any>();
        
        allResponses.forEach((res) => {
            if (!respondentMap.has(res.respondentEmail)) {
                respondentMap.set(res.respondentEmail, {
                    email: res.respondentEmail,
                    respondedAt: res.respondedAt,
                    answers: [],
                });
            }
            
            respondentMap.get(res.respondentEmail).answers.push({
                requirementId: res.requirementId,
                positiveAnswer: res.positiveAnswer,
                negativeAnswer: res.negativeAnswer,
                kanoCategory: res.kanoCategory,
            });
        });

        const respondents = Array.from(respondentMap.values());

        return NextResponse.json({ respondents });
    } catch (error: unknown) {
        log.error('Kano 제출 응답 목록 조회 오류', error);
        return NextResponse.json({ error: '제출 응답 목록 조회 실패' }, { status: 500 });
    }
}
