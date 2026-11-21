// 요구사항 편집 시 텍스트로 연결된 기존 작성 행의 문구와 순서를 보존한다.
import type { Prisma } from '@prisma/client';
import { orderByRequirementText, orderImprovementItems, orderTargetSpecs } from './requirement-order';

type RequirementName = { id?: string; requirement: string };

export async function synchronizeRequirementLinkedOrder(tx: Prisma.TransactionClient, projectId: string, previous: RequirementName[], next: RequirementName[]) {
    const renames = new Map<string, string>();
    for (const old of previous) {
        const replacement = next.find(row => row.id === old.id);
        if (old.requirement.trim() && replacement?.requirement.trim() && replacement.requirement !== old.requirement
            && previous.filter(row => row.requirement.trim() === old.requirement.trim()).length === 1
            && next.filter(row => row.requirement.trim() === replacement.requirement.trim()).length === 1) {
            renames.set(old.requirement.trim(), replacement.requirement);
        }
    }
    const rename = (text: string | null) => text === null ? null : renames.get(text.trim()) ?? text;
    const [trees, improvements, roadmaps, targets] = await Promise.all([
        tx.techTreeEntry.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
        tx.improvementItem.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
        tx.techRoadmap.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
        tx.targetSpec.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
    ]);
    // 이름 교환도 안전하도록 갱신 전 스냅샷의 ID로 각 행을 한 번씩 갱신한다.
    const orderedTrees = orderByRequirementText(trees.map(row => ({ ...row, customerVoice: rename(row.customerVoice) })), next, row => row.customerVoice);
    for (const row of orderedTrees) {
        const before = trees.find(item => item.id === row.id)!;
        if (before.order === row.order && before.customerVoice === row.customerVoice) continue;
        await tx.techTreeEntry.updateMany({ where: { id: row.id, projectId }, data: { customerVoice: row.customerVoice, order: row.order } });
    }
    for (const row of orderImprovementItems(improvements.map(row => ({ ...row, content: rename(row.content) })), next)) {
        const before = improvements.find(item => item.id === row.id)!;
        if (before.order === row.order && before.content === row.content) continue;
        await tx.improvementItem.updateMany({ where: { id: row.id, projectId }, data: { content: row.content, order: row.order } });
    }
    for (const row of orderByRequirementText(roadmaps.map(row => ({ ...row, category: rename(row.category) })), next, row => row.category)) {
        const before = roadmaps.find(item => item.id === row.id)!;
        if (before.order === row.order && before.category === row.category) continue;
        await tx.techRoadmap.updateMany({ where: { id: row.id, projectId }, data: { category: row.category, order: row.order } });
    }
    for (const row of orderTargetSpecs(targets, orderedTrees)) {
        if (targets.find(item => item.id === row.id)!.order === row.order) continue;
        await tx.targetSpec.updateMany({ where: { id: row.id, projectId }, data: { order: row.order } });
    }
}
