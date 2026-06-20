import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { resetKanoProjectResponses } from '@/lib/kano-response-reset';

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

        // 사용자 이메일별로 응답을 병합합니다.
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

export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;
        const includeInvitations = request.nextUrl.searchParams.get('includeInvitations') === 'true';

        const result = await prisma.$transaction(async (tx) =>
            resetKanoProjectResponses(tx, projectId, { includeInvitations })
        );

        return NextResponse.json({
            success: true,
            message: includeInvitations
                ? '현재 프로젝트의 Kano 응답 데이터와 초대 내역이 리셋되었습니다.'
                : '현재 프로젝트의 Kano 응답 데이터가 리셋되었습니다.',
            ...result,
        });
    } catch (error: unknown) {
        log.error('Kano 응답 데이터 리셋 오류', error);
        return NextResponse.json({ error: 'Kano 응답 데이터 리셋 실패' }, { status: 500 });
    }
}
