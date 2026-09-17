// JSON 백업의 프로젝트 소속 참조를 검증하고 설문 응답을 복원 대상 초대에 연결한다.
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { generateId } from './id';
import type { ImportJsonPayload } from './import-json-schema';

export class ImportReferenceError extends Error {}

type ReferenceParent = {
    label: string;
    rows?: { id?: string }[];
    model: { findMany: (args: { where: { projectId: string; id: { in: string[] } }; select: { id: true } }) => Promise<{ id: string }[]> };
    references: string[];
};

export async function validateImportReferences(tx: Prisma.TransactionClient, projectId: string, data: ImportJsonPayload) {
    const parents: ReferenceParent[] = [
        {
            label: '고객요구사항', rows: data.customerRequirements, model: tx.customerRequirement,
            references: [...(data.qfdRelationships ?? []), ...(data.kanoResponses ?? []), ...(data.benchmarks ?? [])].map(row => row.requirementId),
        },
        {
            label: '기술특성', rows: data.technicalCharacteristics, model: tx.technicalCharacteristic,
            references: [
                ...(data.qfdRelationships ?? []).map(row => row.technicalCharId),
                ...(data.technicalBenchmarks ?? []).map(row => row.technicalCharId),
                ...(data.techCorrelations ?? []).flatMap(row => [row.techId1, row.techId2]),
            ],
        },
        {
            label: '제품 속성', rows: data.productAttributes, model: tx.productAttribute,
            references: (data.attributeFitnesses ?? []).map(row => row.attributeId),
        },
    ];
    for (const parent of parents) {
        const ids = parent.rows?.flatMap(row => row.id ? [row.id] : []);
        if (ids && new Set(ids).size !== ids.length) {
            throw new ImportReferenceError(`${parent.label} 식별자가 백업에 중복되어 있습니다.`);
        }
        if (parent.references.length === 0) continue;
        const existing = ids ?? (await parent.model.findMany({
            where: { projectId, id: { in: [...new Set(parent.references)] } }, select: { id: true },
        })).map(row => row.id);
        const allowedIds = new Set(existing);
        if (parent.references.some(id => !allowedIds.has(id))) {
            throw new ImportReferenceError(`백업 또는 복원 대상 프로젝트에 없는 ${parent.label}을 참조하고 있습니다.`);
        }
    }
}

export async function restoreResponseInvitations(
    tx: Prisma.TransactionClient,
    projectId: string,
    responses: NonNullable<ImportJsonPayload['kanoResponses']>,
): Promise<Map<string, string>> {
    const responseDates = new Map<string, Date>();
    const now = new Date();
    for (const response of responses) {
        const date = response.respondedAt ? new Date(response.respondedAt) : now;
        const previous = responseDates.get(response.respondentEmail);
        if (!previous || date > previous) responseDates.set(response.respondentEmail, date);
    }
    const invitationIds = new Map<string, string>();
    for (const [email, respondedAt] of responseDates) {
        // 기존 백업에는 초대 정보가 없다. 대상 프로젝트의 동일 이메일 초대를 재사용하고,
        // 없으면 이미 응답한 기록용 초대를 만든다. 원본 프로젝트의 토큰은 복사하지 않는다.
        const invitation = await tx.kanoSurveyInvitation.upsert({
            where: { projectId_email: { projectId, email } },
            create: { id: generateId('inv'), projectId, email, token: randomUUID(), expiresAt: now, isUsed: true, respondedAt },
            update: { isUsed: true, respondedAt },
            select: { id: true },
        });
        invitationIds.set(email, invitation.id);
    }
    return invitationIds;
}
