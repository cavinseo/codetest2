// 파일로 들어온 Kano 응답을 DB 에 쓰는 트랜잭션 본문이다.
//
// 규칙(초대 upsert → 응답 createMany, 삭제 범위)은 엑셀 업로드 라우트
// (app/api/projects/[id]/kano/upload-excel/route.ts:152-205)와 같다 — 경로마다 갈라지면
// 초대 상태·응답자 표가 어긋난다. 엑셀 라우트는 실DB 에 대해 전체 삭제를 수행하는 운영
// 경로라 이번에는 옮기지 않고, 여기가 그 규칙의 두 번째 사본이 된다는 것을 안다.
// prisma 를 직접 import 하지 않고 트랜잭션 클라이언트를 인자로 받아 목 객체로 테스트한다.
import { generateId } from './id';
import { classifyKanoResponse, type KanoAnswer } from './kano-algorithm';

export interface KanoImportAnswer {
    requirementId: string;
    positiveAnswer: KanoAnswer;
    negativeAnswer: KanoAnswer;
}

export interface KanoImportRespondent {
    email: string;
    respondedAt: Date;
    /** 초대 토큰. 없으면 `${tokenPrefix}_${generateId('inv')}` 로 만든다. 오프라인 경로는 submissionId 로 고정한다. */
    token?: string;
    answers: KanoImportAnswer[];
}

export interface KanoImportOptions {
    projectId: string;
    invitedBy: string;
    /** 'excel' | 'offline'. 초대 토큰 접두어이자 어느 경로가 만든 초대인지 구분하는 표지다. */
    tokenPrefix: 'excel' | 'offline';
    /** 'replace' 는 프로젝트의 응답·초대를 전부 지운다(엑셀 경로 전용). 'append' 는 이 응답자들의 응답만 지운다. */
    writePolicy: 'append' | 'replace';
    /** 초대가 새로 만들어질 때의 만료 시각. 엑셀은 +1년, 오프라인은 now(즉시 만료). */
    invitationExpiresAt: (now: Date) => Date;
    now?: Date;
}

export interface KanoImportResult {
    respondentCount: number;
    importedCount: number;
    /** 이미 응답이 있던 이메일 수. 라우트가 응답 본문·토스트로 알린다. */
    overwrittenRespondentCount: number;
}

/** 이 함수가 쓰는 Prisma 메서드만 담은 최소 인터페이스다. Prisma.TransactionClient 가 구조적으로 만족한다. */
export interface KanoImportTx {
    kanoResponse: {
        deleteMany(args: { where: { projectId: string; respondentEmail?: { in: string[] } } }): Promise<{ count: number }>;
        findMany(args: { where: { projectId: string; respondentEmail: { in: string[] } }; select: { respondentEmail: true }; distinct: ['respondentEmail'] }): Promise<Array<{ respondentEmail: string }>>;
        createMany(args: { data: Array<Record<string, unknown>> }): Promise<{ count: number }>;
    };
    kanoSurveyInvitation: {
        deleteMany(args: { where: { projectId: string } }): Promise<{ count: number }>;
        upsert(args: {
            where: { projectId_email: { projectId: string; email: string } };
            update: { respondedAt: Date; isUsed: true };
            create: Record<string, unknown>;
            select: { id: true };
        }): Promise<{ id: string }>;
    };
}

export async function importKanoResponses(
    tx: KanoImportTx,
    respondents: KanoImportRespondent[],
    options: KanoImportOptions
): Promise<KanoImportResult> {
    const now = options.now ?? new Date();
    const { projectId } = options;
    const emails = respondents.map((respondent) => respondent.email);

    // 덮어쓴 수는 삭제 전에 세어야 한다.
    const existing = options.writePolicy === 'replace' || emails.length === 0
        ? []
        : await tx.kanoResponse.findMany({
            where: { projectId, respondentEmail: { in: emails } },
            select: { respondentEmail: true },
            distinct: ['respondentEmail'],
        });

    if (options.writePolicy === 'replace') {
        await tx.kanoResponse.deleteMany({ where: { projectId } });
        await tx.kanoSurveyInvitation.deleteMany({ where: { projectId } });
    } else if (emails.length > 0) {
        await tx.kanoResponse.deleteMany({ where: { projectId, respondentEmail: { in: emails } } });
    }

    const invitationIds = new Map<string, string>();
    for (const respondent of respondents) {
        const invitation = await tx.kanoSurveyInvitation.upsert({
            where: { projectId_email: { projectId, email: respondent.email } },
            update: { respondedAt: respondent.respondedAt, isUsed: true },
            create: {
                id: generateId('inv'),
                projectId,
                email: respondent.email,
                token: respondent.token ?? `${options.tokenPrefix}_${generateId('inv')}`,
                invitedBy: options.invitedBy,
                expiresAt: options.invitationExpiresAt(now),
                respondedAt: respondent.respondedAt,
                isUsed: true,
            },
            select: { id: true },
        });
        invitationIds.set(respondent.email, invitation.id);
    }

    const rows = respondents.flatMap((respondent) => {
        const invitationId = invitationIds.get(respondent.email);
        if (!invitationId) throw new Error('Invitation missing after upsert.');
        return respondent.answers.map((answer) => ({
            id: generateId('response'),
            invitationId,
            projectId,
            requirementId: answer.requirementId,
            respondentEmail: respondent.email,
            positiveAnswer: answer.positiveAnswer,
            negativeAnswer: answer.negativeAnswer,
            kanoCategory: classifyKanoResponse(answer.positiveAnswer, answer.negativeAnswer),
            respondedAt: respondent.respondedAt,
        }));
    });
    if (rows.length > 0) {
        await tx.kanoResponse.createMany({ data: rows });
    }

    return {
        respondentCount: respondents.length,
        importedCount: rows.length,
        overwrittenRespondentCount: existing.length,
    };
}
