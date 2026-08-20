import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { generateId } from '@/lib/id';
import { importDeletionPlan, importHasAnyData } from '@/lib/import-json-plan';
import { importJsonSchema } from '@/lib/import-json-schema';
import {
    countCascadeImpact,
    describeCascadeImpact,
    hasCascadeImpact,
} from '@/lib/import-cascade-guard';

const log = createLogger('api/import-json');

type IdPrefix = Parameters<typeof generateId>[0];

/**
 * 복원할 행마다 새 id 를 만들고, 백업 파일의 옛 id 와 이어 주는 표를 함께 돌려준다.
 * 클라이언트가 보낸 id 를 그대로 PK 로 쓰지 않으면서도, 백업 안에서 서로를 가리키던
 * 참조(QFD·설문 응답의 requirementId 등)를 새 id 로 다시 이어 주기 위해 필요하다.
 */
function assignIds(list: { id?: string }[], prefix: IdPrefix): { ids: string[]; map: Map<string, string> } {
    const ids = list.map(() => generateId(prefix));
    const map = new Map<string, string>();
    list.forEach((row, index) => {
        if (row.id) map.set(row.id, ids[index]);
    });

    return { ids, map };
}

/** 옛 id 를 새 id 로 바꾼다. 그 컬렉션을 복원하지 않는 경우에는 옛 값을 그대로 둔다. */
function linkId(map: Map<string, string>, oldId: string): string {
    return map.get(oldId) ?? oldId;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        // 검증 없이 {...r, projectId} 로 펼쳐 넣던 자리다. 화이트리스트 스키마가
        // 모르는 열과 과도한 행수를 먼저 걸러낸다.
        const parsed = importJsonSchema.safeParse(await request.json());
        if (!parsed.success) {
            const issue = parsed.error.errors[0];
            const where = issue.path.join('.');
            return NextResponse.json(
                { error: `가져오기 형식이 올바르지 않습니다(${where || '최상위'}).` },
                { status: 400 }
            );
        }
        const importData = parsed.data;

        // 최소 하나의 데이터 배열이 있어야 import 허용 (빈 payload로 전체 삭제 방지)
        if (!importHasAnyData(importData)) {
            return NextResponse.json(
                { error: '가져올 데이터가 없습니다.' },
                { status: 400 }
            );
        }

        // 고객요구사항을 덮어쓰면 설문 응답·벤치마크·QFD 가 CASCADE 로 함께 사라진다.
        // 재수집이 불가능한 데이터라 건수를 세어 확인을 받는다(엑셀 import 와 동일).
        const cascadeImpact = await countCascadeImpact(prisma, projectId, {
            replacesCustomerRequirements: Array.isArray(importData.customerRequirements),
        });
        if (hasCascadeImpact(cascadeImpact) && importData.confirmCascade !== true) {
            return NextResponse.json(
                {
                    error: describeCascadeImpact(cascadeImpact),
                    needsCascadeConfirm: true,
                    cascadeImpact,
                },
                { status: 409 }
            );
        }

        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다.' },
                { status: 404 }
            );
        }

        const requirements = importData.customerRequirements ?? [];
        const technicals = importData.technicalCharacteristics ?? [];
        const specs = importData.specFunctions ?? [];
        const attributes = importData.productAttributes ?? [];
        const fitnesses = importData.attributeFitnesses ?? [];
        const qfdRelationships = importData.qfdRelationships ?? [];
        const kanoResponses = importData.kanoResponses ?? [];

        const requirementIds = assignIds(requirements, 'spec');
        const technicalIds = assignIds(technicals, 'tech');
        const specIds = assignIds(specs, 'spec');
        const attributeIds = assignIds(attributes, 'attr');

        // 해당 프로젝트의 기존 데이터를 삭제하고 새 데이터로 교체(트랜잭션)
        // 중요: payload에 실제로 포함된 컬렉션만 삭제합니다. 부분 payload가
        // 무관한 컬렉션(고객요구/설문응답/벤치마크 등)을 전부 지우던 문제를 방지.
        await prisma.$transaction(async (tx) => {
            const delegates = tx as unknown as Record<
                string,
                { deleteMany: (args: { where: { projectId: string } }) => Promise<unknown> }
            >;
            for (const model of importDeletionPlan(importData)) {
                await delegates[model].deleteMany({ where: { projectId } });
            }

            // 새 데이터 삽입. id·projectId 는 클라이언트 값을 쓰지 않는다. createdAt·
            // respondedAt 은 신원·소유권 열이 아니라 실제 기록 시각이므로 값이 있으면
            // 그대로 복원하고, 없으면 컬럼 기본값(now())에 맡긴다.
            if (requirements.length > 0) {
                await tx.customerRequirement.createMany({
                    data: requirements.map((r, index) => ({
                        id: requirementIds.ids[index],
                        projectId,
                        category: r.category,
                        subcategory: r.subcategory ?? null,
                        requirement: r.requirement,
                        kanoPositiveQ: r.kanoPositiveQ ?? null,
                        kanoNegativeQ: r.kanoNegativeQ ?? null,
                        kanoWeight: r.kanoWeight ?? null,
                        order: r.order,
                        createdAt: r.createdAt ? new Date(r.createdAt) : undefined,
                    })),
                });
            }
            if (technicals.length > 0) {
                await tx.technicalCharacteristic.createMany({
                    data: technicals.map((t, index) => ({
                        id: technicalIds.ids[index],
                        projectId,
                        name: t.name,
                        unit: t.unit ?? null,
                        targetValue: t.targetValue ?? null,
                    })),
                });
            }
            if (specs.length > 0) {
                await tx.specFunction.createMany({
                    data: specs.map((s, index) => ({
                        id: specIds.ids[index],
                        projectId,
                        level: s.level,
                        // 상위 기능도 새 id 를 받았으므로 참조를 새 id 로 잇는다.
                        parentId: s.parentId ? linkId(specIds.map, s.parentId) : null,
                        name: s.name,
                        technology: s.technology ?? null,
                        order: s.order,
                    })),
                });
            }
            if (attributes.length > 0) {
                await tx.productAttribute.createMany({
                    data: attributes.map((a, index) => ({
                        id: attributeIds.ids[index],
                        projectId,
                        productName: a.productName ?? null,
                        customerName: a.customerName ?? null,
                        marketSegment: a.marketSegment ?? null,
                        customerNeed: a.customerNeed ?? null,
                        benefit: a.benefit ?? null,
                        attribute: a.attribute ?? null,
                        techCapability: a.techCapability ?? null,
                        order: a.order,
                    })),
                });
            }
            if (fitnesses.length > 0) {
                await tx.attributeFitness.createMany({
                    data: fitnesses.map((f) => ({
                        id: generateId('fitness'),
                        projectId,
                        attributeId: linkId(attributeIds.map, f.attributeId),
                        importance: f.importance,
                        currentLevel: f.currentLevel,
                        targetLevel: f.targetLevel,
                        note: f.note ?? null,
                    })),
                });
            }
            if (qfdRelationships.length > 0) {
                await tx.qFDMatrix.createMany({
                    data: qfdRelationships.map((q) => ({
                        id: generateId('rel'),
                        projectId,
                        requirementId: linkId(requirementIds.map, q.requirementId),
                        technicalCharId: linkId(technicalIds.map, q.technicalCharId),
                        // 컬럼명은 strength 다. 예전에는 relationship 으로 넣어 항상 실패했다.
                        strength: q.strength,
                        currentScore: q.currentScore ?? null,
                        competitorScore: q.competitorScore ?? null,
                    })),
                });
            }
            if (kanoResponses.length > 0) {
                await tx.kanoResponse.createMany({
                    data: kanoResponses.map((k) => ({
                        id: generateId('response'),
                        projectId,
                        requirementId: linkId(requirementIds.map, k.requirementId),
                        invitationId: k.invitationId,
                        respondentEmail: k.respondentEmail,
                        positiveAnswer: k.positiveAnswer,
                        negativeAnswer: k.negativeAnswer,
                        kanoCategory: k.kanoCategory,
                        respondedAt: k.respondedAt ? new Date(k.respondedAt) : undefined,
                    })),
                });
            }

            // 프로젝트 기본 정보 업데이트
            if (importData.project) {
                await tx.project.update({
                    where: { id: projectId },
                    data: {
                        description: importData.project.description,
                        detailedDescription: importData.project.detailedDescription,
                    },
                });
            }
        });

        log.info('Data imported successfully', { projectId });

        return NextResponse.json({
            success: true,
            message: '데이터를 성공적으로 가져왔습니다.',
            imported: {
                specFunctions: specs.length,
                productAttributes: attributes.length,
                attributeFitnesses: fitnesses.length,
                customerRequirements: requirements.length,
                technicalCharacteristics: technicals.length,
                qfdRelationships: qfdRelationships.length,
                kanoResponses: kanoResponses.length,
            },
        });
    } catch (error: unknown) {
        log.error('Import error', error);
        return NextResponse.json(
            { error: '데이터 가져오기에 실패했습니다.' },
            { status: 500 }
        );
    }
}
