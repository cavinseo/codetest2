// 고객요구사항 순서에 연결된 워크시트 행을 기존 내용과 함께 재배치한다.
import { groupRequirementsByCategory, type RequirementGroupingRowLike } from './requirements-table-utils';

export type OrderedRequirement = RequirementGroupingRowLike & { id: string; requirement: string };

export function orderByRequirementIds<T>(rows: T[], requirements: { id: string }[], idOf: (row: T) => string): T[] {
    const positions = new Map(requirements.map((row, index) => [row.id, index]));
    return [...rows].sort((a, b) => (positions.get(idOf(a)) ?? Infinity) - (positions.get(idOf(b)) ?? Infinity));
}

// 문자열만 연결된 과거 행은 중복 문구를 임의로 특정 ID에 붙이지 않는다.
export function orderByRequirementText<T extends { order?: number | null }>(rows: T[], requirements: { requirement: string }[], textOf: (row: T) => string | null | undefined): T[] {
    const positions = new Map<string, number>();
    const duplicates = new Set<string>();
    requirements.forEach((row, index) => {
        const text = row.requirement.trim();
        if (positions.has(text)) duplicates.add(text);
        else if (text) positions.set(text, index);
    });
    duplicates.forEach(text => positions.delete(text));
    return [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .sort((a, b) => (positions.get(textOf(a)?.trim() ?? '') ?? Infinity) - (positions.get(textOf(b)?.trim() ?? '') ?? Infinity))
        .map((row, order) => ({ ...row, order }));
}

export function orderImprovementItems<T extends { type: string; content?: string | null; order?: number | null }>(rows: T[], requirements: { requirement: string }[]): T[] {
    const types = [...new Set(rows.map(row => row.type))];
    return types.flatMap(type => orderByRequirementText(rows.filter(row => row.type === type), requirements, row => row.content));
}

export function orderTargetSpecs<T extends { category: string | null; subCategory?: string | null; order?: number | null }>(rows: T[], entries: { coreSpec?: string | null; subSpec?: string | null }[]): T[] {
    const key = (core: string, sub: string) => `${core.trim()}\u0000${sub.trim()}`;
    const corePositions = new Map<string, number>();
    const positions = new Map<string, number>();
    entries.forEach((row, index) => {
        const core = row.coreSpec?.trim() ?? '';
        if (!core) return;
        if (!corePositions.has(core)) corePositions.set(core, index);
        const pair = key(core, row.subSpec ?? '');
        if (!positions.has(pair)) positions.set(pair, index);
    });
    return [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .sort((a, b) => {
            const coreA = a.category?.trim() ?? '';
            const coreB = b.category?.trim() ?? '';
            const coreOrder = (corePositions.get(coreA) ?? Infinity) - (corePositions.get(coreB) ?? Infinity);
            if (coreA !== coreB) return Number.isNaN(coreOrder) ? 0 : coreOrder;
            return (positions.get(key(coreA, a.subCategory ?? '')) ?? Infinity) - (positions.get(key(coreB, b.subCategory ?? '')) ?? Infinity);
        })
        .map((row, order) => ({ ...row, order }));
}

export function orderRequirementLinkedWorksheets<T extends {
    requirements: OrderedRequirement[];
    techTreeEntries: { customerVoice: string | null; coreSpec: string | null; subSpec: string | null; order: number }[];
    improvementItems: { type: string; content: string | null; order: number }[];
    techRoadmaps: { category: string | null; order: number }[];
    targetSpecs: { category: string | null; subCategory: string | null; order: number }[];
}>(project: T): T {
    const requirements = groupRequirementsByCategory(project.requirements);
    const techTreeEntries = orderByRequirementText(project.techTreeEntries, requirements, row => row.customerVoice);
    return { ...project, requirements, techTreeEntries,
        improvementItems: orderImprovementItems(project.improvementItems, requirements),
        techRoadmaps: orderByRequirementText(project.techRoadmaps, requirements, row => row.category),
        targetSpecs: orderTargetSpecs(project.targetSpecs, techTreeEntries),
    };
}
