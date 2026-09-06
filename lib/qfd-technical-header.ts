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

// 접힌 그룹 목록에서 하나만 뒤집는다 — 펼칠 때는 키를 지워서 "전체 펼치기"(빈 객체)와
// 표현이 어긋나지 않게 한다.
export function toggleGroupVisibility(
    collapsedGroups: Record<number, boolean>,
    groupIndex: number,
): Record<number, boolean> {
    if (collapsedGroups[groupIndex]) {
        return Object.entries(collapsedGroups).reduce<Record<number, boolean>>((result, [key, value]) => {
            if (Number(key) !== groupIndex) result[Number(key)] = value;
            return result;
        }, {});
    }
    return { ...collapsedGroups, [groupIndex]: true };
}
