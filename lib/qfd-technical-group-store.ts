// WS-10 핵심스펙 그룹을 WS-9에 동기화하면서 기존 식별자와 분석 입력값을 보존한다.
import type { Prisma } from '@prisma/client';
import { generateId } from './id';
import { assignTechnicalCoreGroups, type CoreFunctionLink } from './qfd-technical-groups';
import { findMissingTechnicalCharNames } from './qfd-technical-sync';

export const technicalOrderBy = [{ groupIndex: 'asc' }, { columnOrder: 'asc' }, { id: 'asc' }] satisfies Prisma.TechnicalCharacteristicOrderByWithRelationInput[];

/** 호출자가 프로젝트 행을 잠근 트랜잭션에서 실행한다. */
export async function synchronizeTechnicalCoreGroups(
    tx: Prisma.TransactionClient, projectId: string, entries: CoreFunctionLink[], addMissing: boolean
) {
    const existing = await tx.technicalCharacteristic.findMany({ where: { projectId }, orderBy: technicalOrderBy });
    const missing = addMissing ? findMissingTechnicalCharNames(entries.map(entry => entry.subSpec ?? ''), existing.map(tech => tech.name)) : [];
    const firstGroup = existing.length ? Math.max(...existing.map(tech => tech.groupIndex)) + 1 : 0;
    const additions = missing.map((name, index) => ({
        id: generateId('tech'), projectId, name, unit: null, targetValue: null, groupIndex: firstGroup, columnOrder: index,
    }));
    const rows = assignTechnicalCoreGroups([...existing, ...additions], entries);
    const byId = new Map(existing.map(tech => [tech.id, tech]));
    const newRows = rows.filter(tech => !byId.has(tech.id));
    if (newRows.length) await tx.technicalCharacteristic.createMany({ data: newRows });
    for (const row of rows) {
        const previous = byId.get(row.id);
        if (previous && (previous.groupIndex !== row.groupIndex || previous.columnOrder !== row.columnOrder)) {
            await tx.technicalCharacteristic.update({ where: { id: row.id }, data: { groupIndex: row.groupIndex, columnOrder: row.columnOrder } });
        }
    }
    return rows.sort((a, b) => a.groupIndex - b.groupIndex || a.columnOrder - b.columnOrder || a.id.localeCompare(b.id));
}
