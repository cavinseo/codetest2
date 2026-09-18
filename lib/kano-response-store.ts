// 업로드된 Kano 응답을 초대·응답 테이블에 쓰는 트랜잭션이다.
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { classifyKanoResponse } from '@/lib/kano-algorithm';
import type { ParsedKanoUploadAnswer } from '@/lib/kano-upload-parser';
import type { Prisma } from '@prisma/client';

// 판정은 lib/write-policy.ts 한 곳에 있다. 기존 import 경로를 깨지 않도록
// 여기서 다시 내보낸다.
export { parseWritePolicy } from '@/lib/write-policy';
export type { WritePolicy } from '@/lib/write-policy';

export interface PersistKanoUploadInput {
    projectId: string;
    invitedBy: string;
    writePolicy: 'append' | 'replace';
    requirements: { id: string }[];
    answers: ParsedKanoUploadAnswer[];
}

export interface PersistKanoUploadResult {
    respondentCount: number;
    importedCount: number;
}

const EXCEL_INVITATION_DURATION_MS = 1000 * 60 * 60 * 24 * 365;

function uniqueRespondentEmails(answers: ParsedKanoUploadAnswer[]) {
    return Array.from(new Set(answers.map((answer) => answer.respondentEmail)));
}

async function clearPreviousUploadResponses(
    tx: Prisma.TransactionClient,
    projectId: string,
    writePolicy: PersistKanoUploadInput['writePolicy'],
    respondentEmails: string[]
) {
    if (writePolicy === 'replace') {
        await tx.kanoResponse.deleteMany({ where: { projectId } });
        await tx.kanoSurveyInvitation.deleteMany({ where: { projectId } });
        return;
    }

    await tx.kanoResponse.deleteMany({
        where: { projectId, respondentEmail: { in: respondentEmails } },
    });
}

async function getStoredInvitationIds(
    tx: Prisma.TransactionClient,
    projectId: string,
    invitedBy: string,
    respondentEmails: string[],
    respondedAt: Date
) {
    await tx.kanoSurveyInvitation.updateMany({
        where: { projectId, email: { in: respondentEmails } },
        data: { respondedAt, isUsed: true },
    });
    await tx.kanoSurveyInvitation.createMany({
        data: respondentEmails.map((email) => ({
            id: generateId('inv'),
            projectId,
            email,
            token: `excel_${generateId('inv')}`,
            invitedBy,
            expiresAt: new Date(Date.now() + EXCEL_INVITATION_DURATION_MS),
            respondedAt,
            isUsed: true,
        })),
        skipDuplicates: true,
    });

    const storedInvitations = await tx.kanoSurveyInvitation.findMany({
        where: { projectId, email: { in: respondentEmails } },
        select: { id: true, email: true },
    });
    return new Map(storedInvitations.map((invitation) => [invitation.email, invitation.id]));
}

function buildKanoResponseRows(
    answers: ParsedKanoUploadAnswer[],
    requirements: PersistKanoUploadInput['requirements'],
    projectId: string,
    invitationIdsByEmail: Map<string, string>
) {
    return answers.map((answer) => {
        const invitationId = invitationIdsByEmail.get(answer.respondentEmail);
        const requirement = requirements[answer.requirementIndex];
        if (!invitationId || !requirement) throw new Error('Invalid parsed Kano response.');
        return {
            id: generateId('response'),
            invitationId,
            projectId,
            requirementId: requirement.id,
            respondentEmail: answer.respondentEmail,
            positiveAnswer: answer.positiveAnswer,
            negativeAnswer: answer.negativeAnswer,
            kanoCategory: classifyKanoResponse(answer.positiveAnswer, answer.negativeAnswer),
            respondedAt: new Date(),
        };
    });
}

export async function persistKanoUploadAnswers(
    input: PersistKanoUploadInput
): Promise<PersistKanoUploadResult> {
    const { projectId, invitedBy, writePolicy, requirements, answers } = input;
    const respondentEmails = uniqueRespondentEmails(answers);
    const respondedAt = new Date();

    await prisma.$transaction(async (tx) => {
        await clearPreviousUploadResponses(tx, projectId, writePolicy, respondentEmails);
        const invitationIdsByEmail = await getStoredInvitationIds(
            tx, projectId, invitedBy, respondentEmails, respondedAt
        );
        await tx.kanoResponse.createMany({
            data: buildKanoResponseRows(answers, requirements, projectId, invitationIdsByEmail),
        });
    });

    return {
        respondentCount: respondentEmails.length,
        importedCount: answers.length,
    };
}
