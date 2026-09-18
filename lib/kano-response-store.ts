// 업로드된 Kano 응답을 초대·응답 테이블에 쓰는 트랜잭션이다.
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { classifyKanoResponse } from '@/lib/kano-algorithm';
import type { ParsedKanoUploadAnswer } from '@/lib/kano-upload-parser';

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

export async function persistKanoUploadAnswers(
    input: PersistKanoUploadInput
): Promise<PersistKanoUploadResult> {
    const { projectId, invitedBy, writePolicy, requirements, answers } = input;
    const respondentEmails = Array.from(new Set(answers.map((answer) => answer.respondentEmail)));
    const invitations = new Map<string, string>();
    const respondedAt = new Date();

    await prisma.$transaction(async (tx) => {
        if (writePolicy === 'replace') {
            await tx.kanoResponse.deleteMany({ where: { projectId } });
            await tx.kanoSurveyInvitation.deleteMany({ where: { projectId } });
        } else {
            await tx.kanoResponse.deleteMany({
                where: {
                    projectId,
                    respondentEmail: { in: respondentEmails },
                },
            });
        }

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
                expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
                respondedAt,
                isUsed: true,
            })),
            skipDuplicates: true,
        });

        const storedInvitations = await tx.kanoSurveyInvitation.findMany({
            where: { projectId, email: { in: respondentEmails } },
            select: { id: true, email: true },
        });
        for (const invitation of storedInvitations) {
            invitations.set(invitation.email, invitation.id);
        }

        await tx.kanoResponse.createMany({
            data: answers.map((answer) => {
                const invitationId = invitations.get(answer.respondentEmail);
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
            }),
        });
    });

    return {
        respondentCount: respondentEmails.length,
        importedCount: answers.length,
    };
}
