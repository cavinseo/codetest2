import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess, isProjectWriteRole } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { resetKanoProjectResponses } from '@/lib/kano-response-reset';
import { z } from 'zod';

const log = createLogger('api/kano/responses');
const selectedRespondentsSchema = z.object({ respondentEmails: z.array(z.string().min(1)).min(1) }).strict();

// GET: Kano 전체 개별 응답자별 결과 목록 조회
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: false });
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

        return NextResponse.json({ respondents, canDelete: isProjectWriteRole(accessResult.role) });
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

        const rawBody = await request.text();
        let respondentEmails: string[] | undefined;
        if (rawBody !== '') {
            let body: unknown;
            try {
                body = JSON.parse(rawBody);
            } catch {
                return NextResponse.json({ error: '삭제할 응답자 목록을 올바른 JSON으로 보내 주세요.' }, { status: 400 });
            }
            const parsed = selectedRespondentsSchema.safeParse(body);
            if (!parsed.success || includeInvitations) {
                return NextResponse.json({ error: '선택 삭제에는 비어 있지 않은 응답자 식별값 목록만 보내 주세요. 초대 전체 삭제와 함께 요청할 수 없습니다.' }, { status: 400 });
            }
            respondentEmails = [...new Set(parsed.data.respondentEmails)];
        }

        const result = await prisma.$transaction(async (tx) =>
            resetKanoProjectResponses(tx, projectId, { includeInvitations, respondentEmails })
        );

        return NextResponse.json({
            success: true,
            message: includeInvitations
                ? '현재 프로젝트의 Kano 응답 데이터와 초대 내역이 리셋되었습니다.'
                : respondentEmails ? '선택한 응답자의 Kano 응답 데이터와 응답 완료 상태가 초기화되었습니다.'
                    : '현재 프로젝트의 Kano 응답 데이터가 리셋되었습니다.',
            ...result,
        });
    } catch (error: unknown) {
        log.error('Kano 응답 데이터 리셋 오류', error);
        return NextResponse.json({ error: 'Kano 응답 데이터 리셋 실패' }, { status: 500 });
    }
}
