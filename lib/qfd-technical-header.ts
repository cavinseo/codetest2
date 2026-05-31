export interface QfdSpecFunctionLike {
    id: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string | null;
    name: string;
    order?: number | null;
}

export function getQfdCoreOptions(specs: QfdSpecFunctionLike[]) {
    return [...specs]
        .filter((spec) => spec.level === 'CORE')
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getQfdSubOptions(specs: QfdSpecFunctionLike[], coreId?: string) {
    return [...specs]
        .filter((spec) => spec.level === 'SUB' && (!coreId || spec.parentId === coreId))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function findCoreIdForSubName(specs: QfdSpecFunctionLike[], subName?: string | null) {
    if (!subName) return '';
    const matchedSub = specs.find((spec) => spec.level === 'SUB' && spec.name === subName);
    return matchedSub?.parentId ?? '';
}

export function chunkTechnicalIndexes(totalColumns: number, groupSize = 3) {
    return Array.from({ length: Math.ceil(totalColumns / groupSize) }, (_, groupIndex) => {
        const start = groupIndex * groupSize;
        const size = Math.min(groupSize, totalColumns - start);
        return { groupIndex, start, size };
    });
}
