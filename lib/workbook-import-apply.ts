// 엑셀 가져오기 결과를 한 트랜잭션으로 프로젝트에 반영한다.
//
// 가져오기 라우트(app/api/projects/[id]/import)가 요청 처리와 이 반영 트랜잭션을 한 파일에 담고
// 있었다(2026-10-25 코드 리뷰 L9). 반영은 "중복 기술특성 확인 → (replace 면) 덮어쓸 표 비우기 →
// 새 행 넣기 → 가져오기 이력 남기기" 순서이고, 단계마다 함수를 나눴다.
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { hasDuplicateTechnicalNames } from './qfd-technical-sync';
import type { WorkbookImportRecords, WorkbookWritePolicy } from './workbook-importer';
import { selectedSheetsInclude } from './workbook-import-sheets';

/** 기존 기술특성과 파일의 기술특성 이름이 겹친다. 라우트가 409 로 알린다. */
export class DuplicateTechnicalNameError extends Error {}

/** 시트가 많은 워크북도 한 트랜잭션 안에서 끝내야 하므로 넉넉히 잡는다. */
const IMPORT_TIMEOUT_MS = 60_000;
const IMPORT_MAX_WAIT_MS = 15_000;

type Tx = Prisma.TransactionClient;

async function assertNoDuplicateTechnicalNames(tx: Tx, projectId: string, records: WorkbookImportRecords, writePolicy: WorkbookWritePolicy) {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
    const existing = writePolicy === 'append'
        ? await tx.technicalCharacteristic.findMany({ where: { projectId }, select: { name: true } }) : [];
    if (hasDuplicateTechnicalNames([...existing, ...records.technicalCharacteristics].map(tech => tech.name))) {
        throw new DuplicateTechnicalNameError();
    }
}

/** replace 정책일 때 파일에 든 표만 비운다. 파일에 없는 표는 건드리지 않는다. */
async function deleteReplacedRecords(tx: Tx, projectId: string, records: WorkbookImportRecords, selectedSheets: string[]) {
    if (records.specFunctions.length > 0) await tx.specFunction.deleteMany({ where: { projectId } });
    if (records.productAttributes.length > 0) {
        await tx.attributeFitness.deleteMany({ where: { projectId } });
        await tx.productAttribute.deleteMany({ where: { projectId } });
    }
    if (records.customerRequirements.length > 0) await tx.customerRequirement.deleteMany({ where: { projectId } });
    if (records.technicalCharacteristics.length > 0) {
        await tx.qFDMatrix.deleteMany({ where: { projectId } });
        await tx.techCorrelation.deleteMany({ where: { projectId } });
        await tx.technicalCharacteristic.deleteMany({ where: { projectId } });
    }
    if (
        records.improvementItems.length > 0
        || selectedSheetsInclude(selectedSheets, ['개선포인트도출', '개선포인트'])
    ) await tx.improvementItem.deleteMany({ where: { projectId } });
    if (records.targetSpecs.length > 0) await tx.targetSpec.deleteMany({ where: { projectId } });
    if (records.techRoadmaps.length > 0) await tx.techRoadmap.deleteMany({ where: { projectId } });
    if (records.assetItems.length > 0) await tx.assetItem.deleteMany({ where: { projectId } });
    if (records.fundingPlans.length > 0) await tx.fundingPlan.deleteMany({ where: { projectId } });
    if (records.fundingSources.length > 0) await tx.fundingSource.deleteMany({ where: { projectId } });
    if (records.salesEstimates.length > 0) await tx.salesEstimate.deleteMany({ where: { projectId } });
}

async function insertImportedRecords(tx: Tx, projectId: string, records: WorkbookImportRecords) {
    if (records.salesEstimates.length > 0) {
        await tx.salesEstimate.createMany({
            data: records.salesEstimates.map((row) => ({
                customer: row.customer,
                period: row.period === 'Y_PLUS_1' ? 'Y_PLUS_1' : 'Y',
                amount: Number(row.amount) || 0,
                futureAmount: 0,
                competitor: row.competitor,
                order: row.order,
                projectId,
            })),
        });
    }
    if (records.specFunctions.length > 0) {
        await tx.specFunction.createMany({ data: records.specFunctions.map((row) => ({ ...row, projectId })) });
    }
    if (records.productAttributes.length > 0) {
        await tx.productAttribute.createMany({ data: records.productAttributes.map((row) => ({ ...row, projectId })) });
    }
    if (records.customerRequirements.length > 0) {
        await tx.customerRequirement.createMany({ data: records.customerRequirements.map((row) => ({ ...row, projectId })) });
    }
    if (records.technicalCharacteristics.length > 0) {
        const existing = await tx.technicalCharacteristic.findMany({ where: { projectId }, select: { groupIndex: true } });
        const firstGroup = existing.length ? Math.max(...existing.map(row => row.groupIndex)) + 1 : 0;
        await tx.technicalCharacteristic.createMany({ data: records.technicalCharacteristics.map((row, index) => ({
            ...row, projectId, groupIndex: firstGroup + Math.floor(index / 3), columnOrder: index,
        })) });
        await tx.project.update({ where: { id: projectId }, data: { qfdTechnicalInitialized: true } });
    }
    if (records.improvementItems.length > 0) {
        await tx.improvementItem.createMany({ data: records.improvementItems.map((row) => ({ ...row, projectId })) });
    }
    if (records.targetSpecs.length > 0) {
        await tx.targetSpec.createMany({ data: records.targetSpecs.map((row) => ({ ...row, projectId })) });
    }
    if (records.techRoadmaps.length > 0) {
        await tx.techRoadmap.createMany({ data: records.techRoadmaps.map((row) => ({ ...row, projectId })) });
    }
    if (records.assetItems.length > 0) {
        await tx.assetItem.createMany({ data: records.assetItems.map((row) => ({ ...row, projectId })) });
    }
    if (records.fundingPlans.length > 0) {
        await tx.fundingPlan.createMany({ data: records.fundingPlans.map((row) => ({ ...row, projectId })) });
    }
    if (records.fundingSources.length > 0) {
        await tx.fundingSource.createMany({ data: records.fundingSources.map((row) => ({ ...row, projectId })) });
    }

}

export async function applyImportedRecords(
    projectId: string,
    records: WorkbookImportRecords,
    writePolicy: WorkbookWritePolicy,
    metadata: { userId: string; fileName: string; fileSize: number; selectedSheets: string[] }
) {
    const counts = Object.fromEntries(
        Object.entries(records).map(([key, value]) => [key, value.length])
    ) as Record<keyof WorkbookImportRecords, number>;

    // 워크북 하나가 11개 테이블을 지우고 다시 채운다. 원격 DB 에서는 이 왕복이
    // Prisma 기본 제한(5초)을 쉽게 넘겨, 중간에 트랜잭션이 닫히고 P2028 로 전부
    // 롤백된다(실제로 9.4초 지점에서 끊겼다). 시트가 많은 파일까지 감안해 넉넉히 준다.
    // maxWait 는 커넥션을 기다리는 시간이라, 여러 요청이 겹칠 때를 위해 함께 늘린다.
    await prisma.$transaction(async (tx) => {
        if (records.technicalCharacteristics.length > 0) {
            await assertNoDuplicateTechnicalNames(tx, projectId, records, writePolicy);
        }
        if (writePolicy === 'replace') {
            await deleteReplacedRecords(tx, projectId, records, metadata.selectedSheets);
        }
        await insertImportedRecords(tx, projectId, records);

        await tx.migrationHistory.create({
            data: {
                projectId,
                userId: metadata.userId,
                fileName: metadata.fileName,
                fileSize: metadata.fileSize,
                sheetsMigrated: JSON.stringify({
                    selectedSheets: metadata.selectedSheets,
                    counts,
                    writePolicy,
                }),
                status: 'SUCCESS',
            },
        });
    }, { timeout: IMPORT_TIMEOUT_MS, maxWait: IMPORT_MAX_WAIT_MS });

    return counts;
}
