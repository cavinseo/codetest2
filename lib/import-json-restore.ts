// JSON 백업 파일을 한 트랜잭션으로 프로젝트에 복원한다.
//
// 가져오기 라우트(app/api/projects/[id]/import-json)의 POST 하나가 검증·확인과 이 복원
// 트랜잭션을 함께 담아 약 270줄이었다(2026-10-25 코드 리뷰 L9). 라우트는 입력 검증·삭제 영향
// 확인만 하고, 지우고 다시 채우는 일은 여기서 한다.
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { generateId } from './id';
import { importDeletionPlan } from './import-json-plan';
import type { ImportJsonPayload } from './import-json-schema';
import { validateProductOverview } from './product-overview';
import { restoreResponseInvitations, validateImportReferences } from './import-json-relations';

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

// 가져오기 한 번이 여러 테이블을 지우고 다시 채운다. 원격 DB 에서는 Prisma 기본
// 제한(5초)을 넘겨 중간에 트랜잭션이 닫히므로(P2028) 넉넉히 잡는다.
const IMPORT_JSON_TIMEOUT_MS = 60_000;
const IMPORT_JSON_MAX_WAIT_MS = 15_000;

/**
 * 백업에 든 컬렉션만 지우고 새 id 로 다시 채운다. 백업 안의 참조(요구사항·기술특성·속성 id)는
 * 새 id 로 다시 잇는다. 돌려주는 값은 컬렉션별 복원 행 수다.
 */
export async function restoreImportedProject(
    projectId: string,
    importData: ImportJsonPayload,
    // 기존 데이터를 지우기 직전에 같은 트랜잭션 안에서 부른다. 라우트가 캐스케이드
    // 건수를 다시 세어 사용자가 확인한 건수와 다르면 던져 멈추게 하는 자리다(감리 B4).
    beforeDelete?: (tx: Prisma.TransactionClient) => Promise<void>
) {
    const requirements = importData.customerRequirements ?? [];
    const technicals = importData.technicalCharacteristics ?? [];
    const specs = importData.specFunctions ?? [];
    const attributes = importData.productAttributes ?? [];
    const fitnesses = importData.attributeFitnesses ?? [];
    const qfdRelationships = importData.qfdRelationships ?? [];
    const kanoResponses = importData.kanoResponses ?? [];
    const benchmarks = importData.benchmarks ?? [];
    const techCorrelations = importData.techCorrelations ?? [];
    const technicalBenchmarks = importData.technicalBenchmarks ?? [];
    const techTreeEntries = importData.techTreeEntries ?? [];
    const improvementItems = importData.improvementItems ?? [];
    const targetSpecs = importData.targetSpecs ?? [];
    const techRoadmaps = importData.techRoadmaps ?? [];
    const devPlans = importData.devPlans ?? [];
    const salesEstimates = importData.salesEstimates ?? [];
    const assetItems = importData.assetItems ?? [];
    const fundingPlans = importData.fundingPlans ?? [];
    const fundingSources = importData.fundingSources ?? [];
    const hasFitnessMatrix = Object.hasOwn(importData, 'fitnessMatrix');
    const fitnessMatrix = importData.fitnessMatrix;

    const requirementIds = assignIds(requirements, 'req');
    const technicalIds = assignIds(technicals, 'tech');
    const specIds = assignIds(specs, 'spec');
    const attributeIds = assignIds(attributes, 'attr');

    // 해당 프로젝트의 기존 데이터를 삭제하고 새 데이터로 교체(트랜잭션)
    // 중요: payload에 실제로 포함된 컬렉션만 삭제합니다. 부분 payload가
    // 무관한 컬렉션(고객요구/설문응답/벤치마크 등)을 전부 지우던 문제를 방지.
    await prisma.$transaction(async (tx) => {
        if (importData.technicalCharacteristics) {
            await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
        }
        await validateImportReferences(tx, projectId, importData);
        await beforeDelete?.(tx);
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
                    groupIndex: t.groupIndex ?? Math.floor(index / 3),
                    columnOrder: t.columnOrder ?? index,
                })),
            });
        }
        if (specs.length > 0) {
            await tx.specFunction.createMany({
                data: specs.map((s, index) => ({
                    id: specIds.ids[index],
                    projectId,
                    level: s.level,
                    // 상위 기능도 새 id 를 받았으므로 참조를 새 id 로 잇는다. 이 필드는
                    // 자기참조라서 linkId 의 '못 찾으면 옛 id 유지' 규칙을 쓰면 안 된다 —
                    // 이 트랜잭션이 기존 SpecFunction 을 전부 지운 뒤라 옛 id 는 반드시
                    // 죽은 참조가 된다. 못 찾으면 루트로 떨어뜨린다(null).
                    parentId: s.parentId ? (specIds.map.get(s.parentId) ?? null) : null,
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
            const invitationIds = await restoreResponseInvitations(tx, projectId, kanoResponses);
            await tx.kanoResponse.createMany({
                data: kanoResponses.map((k) => ({
                    id: generateId('response'),
                    projectId,
                    requirementId: linkId(requirementIds.map, k.requirementId),
                    invitationId: invitationIds.get(k.respondentEmail)!,
                    respondentEmail: k.respondentEmail,
                    positiveAnswer: k.positiveAnswer,
                    negativeAnswer: k.negativeAnswer,
                    kanoCategory: k.kanoCategory,
                    respondedAt: k.respondedAt ? new Date(k.respondedAt) : undefined,
                })),
            });
        }
        if (benchmarks.length > 0) {
            await tx.benchmark.createMany({
                data: benchmarks.map(row => ({
                    id: generateId('bm'), projectId,
                    requirementId: linkId(requirementIds.map, row.requirementId),
                    company: row.company, score: row.score,
                })),
            });
        }
        if (techCorrelations.length > 0) {
            await tx.techCorrelation.createMany({
                data: techCorrelations.map(row => ({
                    id: generateId('corr'), projectId,
                    techId1: linkId(technicalIds.map, row.techId1),
                    techId2: linkId(technicalIds.map, row.techId2),
                    correlation: row.correlation,
                })),
            });
        }
        if (technicalBenchmarks.length > 0) {
            await tx.technicalBenchmark.createMany({
                data: technicalBenchmarks.map(row => ({
                    id: generateId('techbm'), projectId,
                    technicalCharId: linkId(technicalIds.map, row.technicalCharId),
                    company: row.company, value: row.value,
                })),
            });
        }

        // importDeletionPlan 이 아래 컬렉션도 지우므로 여기서 다시 채우지 않으면 백업 복원이
        // 워크시트 데이터를 지우기만 한다. 다른 행을 참조하지 않아 id 는 컬럼 기본값에 맡긴다.
        if (techTreeEntries.length > 0) {
            await tx.techTreeEntry.createMany({
                data: techTreeEntries.map((row) => ({
                    projectId,
                    customerVoice: row.customerVoice ?? null,
                    coreSpec: row.coreSpec ?? null,
                    subSpec: row.subSpec ?? null,
                    techCharacteristic: row.techCharacteristic ?? null,
                    order: row.order,
                })),
            });
        }
        if (improvementItems.length > 0) {
            await tx.improvementItem.createMany({
                data: improvementItems.map((row) => ({
                    projectId,
                    type: row.type,
                    content: row.content ?? null,
                    improvementRate: row.improvementRate ?? null,
                    devProportion: row.devProportion ?? null,
                    priority: row.priority ?? null,
                    order: row.order,
                })),
            });
        }
        if (targetSpecs.length > 0) {
            await tx.targetSpec.createMany({
                data: targetSpecs.map((row) => ({
                    projectId,
                    category: row.category ?? null,
                    subCategory: row.subCategory ?? null,
                    specItem: row.specItem ?? null,
                    unit: row.unit ?? null,
                    currentValue: row.currentValue ?? null,
                    competitorValue: row.competitorValue ?? null,
                    targetValue: row.targetValue ?? null,
                    note: row.note ?? null,
                    order: row.order,
                })),
            });
        }
        if (techRoadmaps.length > 0) {
            await tx.techRoadmap.createMany({
                data: techRoadmaps.map((row) => ({
                    projectId,
                    category: row.category ?? null,
                    techItem: row.techItem ?? null,
                    currentLevel: row.currentLevel ?? null,
                    q1: row.q1 ?? null,
                    q2: row.q2 ?? null,
                    q3: row.q3 ?? null,
                    q4: row.q4 ?? null,
                    targetLevel: row.targetLevel ?? null,
                    owner: row.owner ?? null,
                    order: row.order,
                })),
            });
        }
        if (devPlans.length > 0) {
            await tx.devPlan.createMany({
                data: devPlans.map((row) => ({
                    projectId,
                    phase: row.phase ?? null,
                    task: row.task ?? null,
                    description: row.description ?? null,
                    startDate: row.startDate ?? null,
                    endDate: row.endDate ?? null,
                    owner: row.owner ?? null,
                    status: row.status,
                    order: row.order,
                })),
            });
        }
        if (salesEstimates.length > 0) {
            await tx.salesEstimate.createMany({
                data: salesEstimates.map((row) => ({
                    projectId,
                    period: row.period,
                    customer: row.customer ?? null,
                    amount: row.amount,
                    futureAmount: row.futureAmount,
                    competitor: row.competitor ?? null,
                    order: row.order,
                })),
            });
        }
        if (assetItems.length > 0) {
            await tx.assetItem.createMany({
                data: assetItems.map((row) => ({
                    projectId,
                    type: row.type,
                    category: row.category ?? null,
                    content: row.content ?? null,
                    order: row.order,
                })),
            });
        }
        if (fundingPlans.length > 0) {
            await tx.fundingPlan.createMany({
                data: fundingPlans.map((row) => ({
                    projectId,
                    category: row.category ?? null,
                    item: row.item ?? null,
                    year1: row.year1,
                    year2: row.year2 ?? null,
                    year3: row.year3 ?? null,
                    order: row.order,
                })),
            });
        }
        if (fundingSources.length > 0) {
            await tx.fundingSource.createMany({
                data: fundingSources.map((row) => ({
                    projectId,
                    category: row.category ?? null,
                    year1: row.year1 ?? null,
                    year2: row.year2 ?? null,
                    year3: row.year3 ?? null,
                    order: row.order,
                })),
            });
        }
        if (hasFitnessMatrix) {
            if (fitnessMatrix) {
                await tx.fitnessMatrix.upsert({
                    where: { projectId },
                    update: {
                        marketsJson: fitnessMatrix.marketsJson,
                        matrixJson: fitnessMatrix.matrixJson,
                        managerComment: fitnessMatrix.managerComment ?? null,
                        consultantNote: fitnessMatrix.consultantNote ?? null,
                    },
                    create: {
                        projectId,
                        marketsJson: fitnessMatrix.marketsJson,
                        matrixJson: fitnessMatrix.matrixJson,
                        managerComment: fitnessMatrix.managerComment ?? null,
                        consultantNote: fitnessMatrix.consultantNote ?? null,
                    },
                });
            } else {
                await tx.fitnessMatrix.deleteMany({ where: { projectId } });
            }
        }

        // 프로젝트 기본 정보 업데이트
        // 제품 개요(회사·제품명, 이미지, 사업계획서)와 WS-2 접힘 상태도 백업에 들어 있으므로 함께
        // 되돌린다. 이미지 크기 짝 검사는 개요 저장 API 와 같은 규칙을 거쳐야 깨진 이미지가 남지 않는다.
        if (importData.project || importData.technicalCharacteristics || importData.specDetailCollapsed !== undefined) {
            await tx.project.update({
                where: { id: projectId },
                data: {
                    ...validateProductOverview(importData.project ?? {}),
                    companyName: importData.project?.companyName,
                    businessPlanFile: importData.project?.businessPlanFile,
                    specDetailCollapsed: importData.specDetailCollapsed,
                    description: importData.project?.description,
                    detailedDescription: importData.project?.detailedDescription,
                    additionalMarketData: importData.project?.additionalMarketData,
                    includeAdditionalMarketDataInReport: importData.project?.includeAdditionalMarketDataInReport,
                    ...(importData.technicalCharacteristics ? { qfdTechnicalInitialized: true } : {}),
                },
            });
        }
    }, { timeout: IMPORT_JSON_TIMEOUT_MS, maxWait: IMPORT_JSON_MAX_WAIT_MS });

    return {
        specFunctions: specs.length,
        productAttributes: attributes.length,
        attributeFitnesses: fitnesses.length,
        customerRequirements: requirements.length,
        technicalCharacteristics: technicals.length,
        qfdRelationships: qfdRelationships.length,
        kanoResponses: kanoResponses.length,
        benchmarks: benchmarks.length,
        techCorrelations: techCorrelations.length,
        technicalBenchmarks: technicalBenchmarks.length,
        techTreeEntries: techTreeEntries.length,
        improvementItems: improvementItems.length,
        targetSpecs: targetSpecs.length,
        techRoadmaps: techRoadmaps.length,
        devPlans: devPlans.length,
        salesEstimates: salesEstimates.length,
        assetItems: assetItems.length,
        fundingPlans: fundingPlans.length,
        fundingSources: fundingSources.length,
        fitnessMatrix: fitnessMatrix ? 1 : 0,
    };
}
